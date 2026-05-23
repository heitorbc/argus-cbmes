import { Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ComposicaoEntry,
  EscalaDiff,
  EscalaMensal,
  LetraEquipe,
  LetraEquipeRotativa,
  Militar,
  MilitarRef,
} from '@argus/shared-types';
import type {
  ComposicaoEntry as PrismaComposicaoEntry,
  EscalaMensal as PrismaEscalaMensal,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import { resolveDataDir } from '../../common/dev-fixtures';
import { PrismaService } from '../../common/prisma/prisma.service';
import { parseEscalaXlsx, parseFilename } from './escala-xlsx-parser';
import { SheetsDbService } from '../sheets-db/sheets-db.service';
import { rowsToEscalasMensais } from '../sheets-db/sheets-db-serializers';
import { NomeMatcher } from '../mapa-forca/nome-matching';

/**
 * S2.10.11d — Tipos do retorno enriquecido de `listEscaladosDoMilitarNoRange`.
 * `origem` indica de qual seção do XLSX veio o entry; `resolvidoPor` indica
 * se a NF veio do parser (gravada no DB) ou foi resolvida em runtime via
 * NomeMatcher. Útil para o endpoint diagnostic `/agenda/_trace`.
 */
export type OrigemEscalado = 'composicao' | 'mergulho' | 'salvamar';
export type ResolvidoVia = 'nf-salvo' | 'nome-matcher' | 'nao-resolvido';
export interface EscaladoNoRange {
  data: string;
  equipe: LetraEquipeRotativa;
  viatura: string;
  funcao: string;
  origem: OrigemEscalado;
  resolvidoPor: ResolvidoVia;
}

/**
 * Resolve a quinzena (1 ou 2) de um dia ISO usando a fronteira gravada na
 * escala pelo parser. `ultimoDiaQ1` é 13 ou 14 conforme o nome da 1ª aba
 * do XLSX original.
 */
export function quinzenaDoDia(diaIso: string, escala: EscalaMensal): 1 | 2 {
  const dia = Number.parseInt(diaIso.slice(8, 10), 10);
  return dia <= escala.composicaoPorQuinzena.ultimoDiaQ1 ? 1 : 2;
}

function diffComposicao(
  antes: ComposicaoEntry[],
  depois: ComposicaoEntry[],
): EscalaDiff['composicaoAlteradaPorQuinzena']['q1'] {
  const compKey = (e: { equipe: LetraEquipe; viatura: string; funcao: string }) =>
    `${e.equipe}|${e.viatura}|${e.funcao}`;
  const mapAntes = new Map(antes.map((e) => [compKey(e), e.militar.raw]));
  const mapDepois = new Map(depois.map((e) => [compKey(e), e.militar.raw]));
  const allKeys = new Set([...mapAntes.keys(), ...mapDepois.keys()]);
  const out: EscalaDiff['composicaoAlteradaPorQuinzena']['q1'] = [];
  for (const k of [...allKeys].sort()) {
    const a = mapAntes.get(k) ?? null;
    const b = mapDepois.get(k) ?? null;
    if (a !== b) {
      const [equipe, viatura, funcao] = k.split('|') as [LetraEquipe, string, string];
      out.push({ equipe, viatura, funcao, antes: a, depois: b });
    }
  }
  return out;
}

/**
 * S2.8.2 — Merge "preservando dias": para cada `dataIso` em
 * `diasDescartados`, mantém a equipe que estava na escala VIGENTE (atual)
 * em vez da equipe que veio na NOVA.
 */
export function mergeEscalaPreservandoDias(
  antes: EscalaMensal,
  depois: EscalaMensal,
  diasDescartados: readonly string[],
): EscalaMensal {
  if (diasDescartados.length === 0) return depois;
  const novoDiaEquipe = { ...depois.diaEquipe };
  for (const data of diasDescartados) {
    const equipeAntiga = antes.diaEquipe[data];
    if (equipeAntiga) {
      novoDiaEquipe[data] = equipeAntiga;
    } else {
      delete novoDiaEquipe[data];
    }
  }
  return { ...depois, diaEquipe: novoDiaEquipe };
}

/**
 * Computa o diff entre duas escalas do mesmo mês/ano.
 */
export function computeDiff(antes: EscalaMensal, depois: EscalaMensal): EscalaDiff {
  const dias = new Set<string>([...Object.keys(antes.diaEquipe), ...Object.keys(depois.diaEquipe)]);
  const diasAlterados: EscalaDiff['diasAlterados'] = [];
  for (const data of [...dias].sort()) {
    const a = antes.diaEquipe[data] ?? null;
    const b = depois.diaEquipe[data] ?? null;
    if (a !== b) diasAlterados.push({ data, equipeAntes: a, equipeDepois: b });
  }

  return {
    diasAlterados,
    composicaoAlteradaPorQuinzena: {
      q1: diffComposicao(antes.composicaoPorQuinzena.q1, depois.composicaoPorQuinzena.q1),
      q2: diffComposicao(antes.composicaoPorQuinzena.q2, depois.composicaoPorQuinzena.q2),
    },
  };
}

/**
 * S2.10.11a — Lista pares `{ano, mes}` que cobrem o range `[inicioIso, fimIso]`.
 * Usado por `listEscaladosDoMilitarNoRange` para descobrir quais escalas
 * mensais precisam ser carregadas. Tipicamente 1-4 meses.
 */
function mesesNoRange(inicioIso: string, fimIso: string): Array<{ ano: number; mes: number }> {
  if (inicioIso > fimIso) return [];
  const startAno = Number.parseInt(inicioIso.slice(0, 4), 10);
  const startMes = Number.parseInt(inicioIso.slice(5, 7), 10);
  const endAno = Number.parseInt(fimIso.slice(0, 4), 10);
  const endMes = Number.parseInt(fimIso.slice(5, 7), 10);
  const out: Array<{ ano: number; mes: number }> = [];
  let ano = startAno;
  let mes = startMes;
  while (ano < endAno || (ano === endAno && mes <= endMes)) {
    out.push({ ano, mes });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return out;
}

/**
 * S2.10.5 — Persistência em Postgres via Prisma. Sheets-DB continua como
 * espelho institucional (dual-write fire-and-forget). XLSX bootstrap dev
 * só roda se Postgres E Sheets-DB estiverem vazios.
 */
@Injectable()
export class EscalasService implements OnModuleInit {
  private readonly logger = new Logger(EscalasService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly sheetsDb?: SheetsDbService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    await this.bootstrapFromSheetsDbIfEmpty();
    if (process.env.NODE_ENV !== 'production') {
      const total = await this.countMeses();
      if (total === 0) await this.bootstrapFromFilesystem();
    }
  }

  /**
   * Bootstrap one-shot: importa Sheets-DB → Postgres se Postgres está
   * vazio. Idempotente.
   */
  private async bootstrapFromSheetsDbIfEmpty(): Promise<void> {
    try {
      const count = await this.countMeses();
      if (count > 0) return;
      if (!this.sheetsDb?.isEnabled()) {
        this.logger.log('Bootstrap escalas: Postgres vazio + Sheets-DB desabilitado.');
        return;
      }
      const rows = await this.sheetsDb.readEscalaMensal();
      const escalas = rowsToEscalasMensais(rows);
      let imported = 0;
      for (const escala of escalas.values()) {
        await this.upsertNoPostgres(escala);
        imported += 1;
      }
      if (imported > 0) {
        this.logger.log(`Bootstrap escalas: ${imported} meses importados do Sheets-DB → Postgres.`);
      }
    } catch (err) {
      this.logger.warn(`Bootstrap escalas falhou: ${(err as Error).message}.`);
    }
  }

  /**
   * Dev-only — fallback XLSX em `data/Escala de Serviço/`. Roda só se
   * Postgres E Sheets-DB estiverem vazios.
   */
  private async bootstrapFromFilesystem(): Promise<void> {
    const dataDir = resolveDataDir('Escala de Serviço');
    if (!dataDir) {
      this.logger.warn('Bootstrap escalas: pasta "data/Escala de Serviço/" não encontrada.');
      return;
    }
    const xlsxFiles = readdirSync(dataDir)
      .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
      .filter((f) => {
        try {
          parseFilename(f);
          return true;
        } catch {
          return false;
        }
      })
      .map((f) => {
        const { mes, ano } = parseFilename(f);
        return { f, mes, ano };
      })
      .sort((a, b) => b.ano - a.ano || b.mes - a.mes)
      .slice(0, 2);

    for (const { f } of xlsxFiles) {
      const buffer = readFileSync(join(dataDir, f));
      try {
        const escala = await parseEscalaXlsx({ buffer, filename: f });
        await this.upsertNoPostgres(escala);
        this.logger.log(
          `Bootstrap escala: ${f} (${String(escala.mes).padStart(2, '0')}/${escala.ano})`,
        );
      } catch (err) {
        this.logger.error(`Bootstrap escala falhou para "${f}": ${(err as Error).message}`);
      }
    }
  }

  async list(): Promise<{
    escalas: { ano: number; mes: number; origemArquivo: string; importadoEm: string }[];
  }> {
    const rows = await this.prisma.escalaMensal.findMany({
      orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
      select: { ano: true, mes: true, origemArquivo: true, importadoEm: true },
    });
    return {
      escalas: rows.map((r) => ({
        ano: r.ano,
        mes: r.mes,
        origemArquivo: r.origemArquivo,
        importadoEm: r.importadoEm.toISOString(),
      })),
    };
  }

  async get(ano: number, mes: number): Promise<EscalaMensal | null> {
    const row = await this.prisma.escalaMensal.findUnique({
      where: { ano_mes: { ano, mes } },
      include: { composicaoEntries: true },
    });
    if (!row) return null;
    return toEscalaMensal(row);
  }

  async save(escala: EscalaMensal): Promise<EscalaMensal> {
    // S2.10.9d — Sheets-DB dual-write removido. Postgres é canônico desde S2.10.5.
    await this.upsertNoPostgres(escala);
    return (await this.get(escala.ano, escala.mes)) ?? escala;
  }

  async delete(ano: number, mes: number): Promise<boolean> {
    const existing = await this.prisma.escalaMensal.findUnique({
      where: { ano_mes: { ano, mes } },
    });
    if (!existing) return false;
    await this.prisma.escalaMensal.delete({ where: { ano_mes: { ano, mes } } });
    return true;
  }

  async getEscaladosDoDia(
    ano: number,
    mes: number,
    diaIso: string,
  ): Promise<{ equipe: LetraEquipeRotativa | null; entries: ComposicaoEntry[] }> {
    const escala = await this.get(ano, mes);
    if (!escala) return { equipe: null, entries: [] };
    const equipe = escala.diaEquipe[diaIso] ?? null;
    if (!equipe) return { equipe: null, entries: [] };
    const q = quinzenaDoDia(diaIso, escala);
    const bucket = q === 1 ? escala.composicaoPorQuinzena.q1 : escala.composicaoPorQuinzena.q2;
    const entries = bucket.filter((c) => c.equipe === equipe);
    return { equipe, entries };
  }

  /**
   * S2.10.11a — Helper rápido para a Agenda. Em vez de chamar
   * `MapaForcaService.getMapaForcaDoDia()` 30× (10+ fontes cada),
   * lê direto de `EscalaMensal` filtrando pelo militar dentro do range.
   *
   * S2.10.11d — Cobre 3 lacunas reportadas pelo Tech Lead:
   *  1. `c.militar.nf === null` (parser XLSX não resolveu) era descartado
   *     silenciosamente. Agora cai num `NomeMatcher` quando o caller
   *     passa o efetivo consolidado.
   *  2. Mergulho/Salvamar não eram varridos — o militar podia estar
   *     escalado como chefe/motorista/mergulhador/supervisor e nunca
   *     aparecer. Agora a varredura cobre os 2 campos JSON com a mesma
   *     regra de quinzena.
   *  3. O retorno agora carrega `origem` + `resolvidoPor` (útil para
   *     o endpoint diagnostic GET /agenda/_trace).
   *
   * Custo: 1 query Prisma + (opcional) 1 instância de NomeMatcher já
   * passada pelo caller (efetivo carregado 1× por request).
   */
  async listEscaladosDoMilitarNoRange(
    nf: string,
    inicioIso: string,
    fimIso: string,
    efetivo?: readonly Militar[],
  ): Promise<EscaladoNoRange[]> {
    // Identifica os meses do range. Tipicamente 1-4 meses.
    const meses = mesesNoRange(inicioIso, fimIso);
    if (meses.length === 0) return [];

    // Busca todas as escalas dos meses em 1 query.
    const rows = await this.prisma.escalaMensal.findMany({
      where: {
        OR: meses.map(({ ano, mes }) => ({ ano, mes })),
      },
      include: { composicaoEntries: true },
    });

    const matcher = efetivo && efetivo.length > 0 ? new NomeMatcher(efetivo) : null;
    const out: EscaladoNoRange[] = [];

    // Resolve a NF a partir de uma MilitarRef, primeiro pelo campo `nf`
    // direto (preenchido na importação), depois caindo no matcher.
    const resolveRefNf = (ref: MilitarRef): { nf: string | null; via: ResolvidoVia } => {
      if (ref.nf) return { nf: ref.nf, via: 'nf-salvo' };
      if (!matcher) return { nf: null, via: 'nao-resolvido' };
      const r = matcher.resolve(ref);
      if (r.resolved?.nf) return { nf: r.resolved.nf, via: 'nome-matcher' };
      return { nf: null, via: 'nao-resolvido' };
    };

    for (const row of rows) {
      const escala = toEscalaMensal(row);

      // ── Composição principal (A/B/C/D) ───────────────────────────
      for (const [data, equipe] of Object.entries(escala.diaEquipe)) {
        if (data < inicioIso || data > fimIso) continue;
        const q = quinzenaDoDia(data, escala);
        const bucket = q === 1 ? escala.composicaoPorQuinzena.q1 : escala.composicaoPorQuinzena.q2;
        for (const c of bucket) {
          if (c.equipe !== equipe) continue;
          const { nf: entryNf, via } = resolveRefNf(c.militar);
          if (entryNf !== nf) continue;
          out.push({
            data,
            equipe,
            viatura: c.viatura,
            funcao: c.funcao,
            origem: 'composicao',
            resolvidoPor: via,
          });
        }
      }

      // ── Mergulho (recursos MERGULHO 01 / 02) ─────────────────────
      // Defensivo: `Prisma.JsonNull` é um sentinel truthy mas sem
      // `.porDia` — checa o sub-campo antes de iterar.
      if (escala.mergulho?.porDia) {
        for (const [data, schedule] of Object.entries(escala.mergulho.porDia)) {
          if (data < inicioIso || data > fimIso) continue;
          const equipeRotativa = escala.diaEquipe[data];
          if (!equipeRotativa) continue;
          const diaNum = Number.parseInt(data.slice(8, 10), 10);
          const equipesMergulho =
            diaNum <= escala.mergulho.equipesPorQuinzena.ultimoDiaQ1
              ? escala.mergulho.equipesPorQuinzena.q1
              : escala.mergulho.equipesPorQuinzena.q2;
          for (const slot of ['mergulho01', 'mergulho02'] as const) {
            const letra = schedule[slot];
            if (!letra) continue;
            const eq = equipesMergulho[letra];
            if (!eq) continue;
            const viatura = slot === 'mergulho01' ? 'MERGULHO 01' : 'MERGULHO 02';
            const pushIfMatch = (ref: MilitarRef, funcao: string): void => {
              const { nf: entryNf, via } = resolveRefNf(ref);
              if (entryNf !== nf) return;
              out.push({
                data,
                equipe: equipeRotativa,
                viatura,
                funcao,
                origem: 'mergulho',
                resolvidoPor: via,
              });
            };
            if (eq.chefe) pushIfMatch(eq.chefe, 'Ch');
            if (eq.motorista) pushIfMatch(eq.motorista, 'Mot');
            eq.mergulhadores.forEach((m, i) => pushIfMatch(m, `Merg${i + 1}`));
          }
        }
      }

      // ── Salvamar (recurso SALVAMAR 01) ───────────────────────────
      if (escala.salvamar?.porDia) {
        for (const [data, letra] of Object.entries(escala.salvamar.porDia)) {
          if (data < inicioIso || data > fimIso) continue;
          const equipeRotativa = escala.diaEquipe[data];
          if (!equipeRotativa) continue;
          const diaNum = Number.parseInt(data.slice(8, 10), 10);
          const equipesSalvamar =
            diaNum <= escala.salvamar.equipesPorQuinzena.ultimoDiaQ1
              ? escala.salvamar.equipesPorQuinzena.q1
              : escala.salvamar.equipesPorQuinzena.q2;
          const eq = equipesSalvamar[letra];
          if (!eq) continue;
          const [chefe, ...operadores] = eq.supervisores;
          const pushIfMatch = (ref: MilitarRef, funcao: string): void => {
            const { nf: entryNf, via } = resolveRefNf(ref);
            if (entryNf !== nf) return;
            out.push({
              data,
              equipe: equipeRotativa,
              viatura: 'SALVAMAR 01',
              funcao,
              origem: 'salvamar',
              resolvidoPor: via,
            });
          };
          if (chefe) pushIfMatch(chefe, 'Ch');
          operadores.forEach((m, i) => pushIfMatch(m, `Op${i + 1}`));
        }
      }
    }

    out.sort((a, b) => a.data.localeCompare(b.data) || a.viatura.localeCompare(b.viatura));
    return out;
  }

  /**
   * S2.10.11d — Diagnostic helper: para o endpoint `/agenda/_trace`,
   * devolve contagens e amostras dos entries não-resolvidos por mês.
   * Pode ser invocado independentemente do `listEscaladosDoMilitarNoRange`.
   */
  async traceEscalasNoRange(
    inicioIso: string,
    fimIso: string,
  ): Promise<
    Array<{
      ano: number;
      mes: number;
      totalEntriesComposicao: number;
      entriesComNfNull: number;
      amostraNaoResolvidos: Array<{ militarRaw: string; viatura: string; funcao: string }>;
    }>
  > {
    const meses = mesesNoRange(inicioIso, fimIso);
    if (meses.length === 0) return [];
    const rows = await this.prisma.escalaMensal.findMany({
      where: { OR: meses.map(({ ano, mes }) => ({ ano, mes })) },
      include: { composicaoEntries: true },
    });
    return rows.map((row) => {
      const total = row.composicaoEntries.length;
      const naoResolvidos = row.composicaoEntries.filter((e) => !e.militarNf);
      return {
        ano: row.ano,
        mes: row.mes,
        totalEntriesComposicao: total,
        entriesComNfNull: naoResolvidos.length,
        amostraNaoResolvidos: naoResolvidos.slice(0, 10).map((e) => ({
          militarRaw: e.militarRaw,
          viatura: e.viatura,
          funcao: e.funcao,
        })),
      };
    });
  }

  async updateDiaEquipe(
    ano: number,
    mes: number,
    data: string,
    equipe: LetraEquipeRotativa | null,
  ): Promise<EscalaMensal> {
    const escala = await this.get(ano, mes);
    if (!escala) {
      throw new Error(`Escala ${String(mes).padStart(2, '0')}/${ano} não importada`);
    }
    const novoMapa: Record<string, LetraEquipeRotativa> = { ...escala.diaEquipe };
    if (equipe === null) {
      delete novoMapa[data];
    } else {
      novoMapa[data] = equipe;
    }
    await this.prisma.escalaMensal.update({
      where: { ano_mes: { ano, mes } },
      data: { diaEquipe: novoMapa as unknown as object },
    });
    return { ...escala, diaEquipe: novoMapa };
  }

  async upsertComposicao(
    ano: number,
    mes: number,
    quinzena: 1 | 2,
    entry:
      | ComposicaoEntry
      | { equipe: LetraEquipe; viatura: string; funcao: string; militar: null },
  ): Promise<EscalaMensal> {
    const escala = await this.get(ano, mes);
    if (!escala) {
      throw new Error(`Escala ${String(mes).padStart(2, '0')}/${ano} não importada`);
    }
    const escalaRow = await this.prisma.escalaMensal.findUnique({
      where: { ano_mes: { ano, mes } },
      select: { id: true },
    });
    if (!escalaRow) {
      throw new Error(`Escala ${String(mes).padStart(2, '0')}/${ano} não importada`);
    }

    // Remove entry existente com mesma chave (equipe, viatura, funcao) na quinzena.
    await this.prisma.composicaoEntry.deleteMany({
      where: {
        escalaMensalId: escalaRow.id,
        quinzena,
        equipe: entry.equipe,
        viatura: entry.viatura,
        funcao: entry.funcao,
      },
    });

    if (entry.militar !== null) {
      const e = entry as ComposicaoEntry;
      await this.prisma.composicaoEntry.create({
        data: {
          escalaMensalId: escalaRow.id,
          quinzena,
          equipe: e.equipe,
          viatura: e.viatura,
          funcao: e.funcao,
          militarRaw: e.militar.raw,
          militarNf: e.militar.nf ?? null,
          militarPosto: e.militar.postoAbreviado || null,
          militarNomeGuerra: e.militar.nomeGuerra || null,
        },
      });
    }

    return (await this.get(ano, mes)) ?? escala;
  }

  // ── helpers privados ──────────────────────────────────────────────

  private async countMeses(): Promise<number> {
    try {
      return await this.prisma.escalaMensal.count();
    } catch {
      return 0;
    }
  }

  /**
   * Upsert por (ano, mes) com cascata de composicaoEntries: deleta entries
   * antigas e recria. Re-import substitui mês inteiro (ADR-014 D4).
   */
  private async upsertNoPostgres(escala: EscalaMensal): Promise<void> {
    const composicaoCreate = [
      ...escala.composicaoPorQuinzena.q1.map((e) => composicaoToCreate(e, 1)),
      ...escala.composicaoPorQuinzena.q2.map((e) => composicaoToCreate(e, 2)),
    ];

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.escalaMensal.findUnique({
        where: { ano_mes: { ano: escala.ano, mes: escala.mes } },
      });
      // Prisma exige Prisma.JsonNull (não JS null) para limpar campos Json?.
      const mergulhoJson = escala.mergulho
        ? (escala.mergulho as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;
      const salvamarJson = escala.salvamar
        ? (escala.salvamar as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;

      if (existing) {
        await tx.composicaoEntry.deleteMany({ where: { escalaMensalId: existing.id } });
        await tx.escalaMensal.update({
          where: { id: existing.id },
          data: {
            origemArquivo: escala.origemArquivo,
            importadoEm: new Date(escala.importadoEm),
            importadoPorNf: escala.importadoPorNf ?? null,
            diaEquipe: escala.diaEquipe as unknown as Prisma.InputJsonValue,
            avisos: escala.avisos as unknown as Prisma.InputJsonValue,
            mergulho: mergulhoJson,
            salvamar: salvamarJson,
            ultimoDiaQ1: escala.composicaoPorQuinzena.ultimoDiaQ1,
            composicaoEntries: { create: composicaoCreate },
          },
        });
      } else {
        await tx.escalaMensal.create({
          data: {
            ano: escala.ano,
            mes: escala.mes,
            origemArquivo: escala.origemArquivo,
            importadoEm: new Date(escala.importadoEm),
            importadoPorNf: escala.importadoPorNf ?? null,
            diaEquipe: escala.diaEquipe as unknown as Prisma.InputJsonValue,
            avisos: escala.avisos as unknown as Prisma.InputJsonValue,
            mergulho: mergulhoJson,
            salvamar: salvamarJson,
            ultimoDiaQ1: escala.composicaoPorQuinzena.ultimoDiaQ1,
            composicaoEntries: { create: composicaoCreate },
          },
        });
      }
    });
  }
}

function composicaoToCreate(e: ComposicaoEntry, quinzena: 1 | 2) {
  return {
    quinzena,
    equipe: e.equipe,
    viatura: e.viatura,
    funcao: e.funcao,
    militarRaw: e.militar.raw,
    militarNf: e.militar.nf ?? null,
    militarPosto: e.militar.postoAbreviado || null,
    militarNomeGuerra: e.militar.nomeGuerra || null,
  };
}

function toEscalaMensal(
  row: PrismaEscalaMensal & { composicaoEntries: PrismaComposicaoEntry[] },
): EscalaMensal {
  const q1: ComposicaoEntry[] = [];
  const q2: ComposicaoEntry[] = [];
  for (const e of row.composicaoEntries) {
    const entry: ComposicaoEntry = {
      equipe: e.equipe as LetraEquipe,
      viatura: e.viatura,
      funcao: e.funcao,
      militar: {
        raw: e.militarRaw,
        postoAbreviado: e.militarPosto ?? '',
        nomeGuerra: e.militarNomeGuerra ?? '',
        nf: e.militarNf ?? undefined,
      },
    };
    if (e.quinzena === 1) q1.push(entry);
    else q2.push(entry);
  }
  return {
    ano: row.ano,
    mes: row.mes,
    origemArquivo: row.origemArquivo,
    importadoEm: row.importadoEm.toISOString(),
    importadoPorNf: row.importadoPorNf ?? undefined,
    diaEquipe: (row.diaEquipe as unknown as Record<string, LetraEquipeRotativa>) ?? {},
    composicaoPorQuinzena: {
      q1,
      q2,
      ultimoDiaQ1: row.ultimoDiaQ1,
    },
    mergulho: (row.mergulho as unknown as EscalaMensal['mergulho']) ?? undefined,
    salvamar: (row.salvamar as unknown as EscalaMensal['salvamar']) ?? undefined,
    avisos: (row.avisos as unknown as string[]) ?? [],
  };
}
