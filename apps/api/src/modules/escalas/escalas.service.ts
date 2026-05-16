import { Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ComposicaoEntry,
  EscalaDiff,
  EscalaMensal,
  LetraEquipe,
  LetraEquipeRotativa,
} from '@argus/shared-types';
import { resolveDataDir } from '../../common/dev-fixtures';
import { parseEscalaXlsx, parseFilename } from './escala-xlsx-parser';
import { SheetsDbService } from '../sheets-db/sheets-db.service';
import {
  escalaMensalToRows,
  rowsToEscalasMensais,
} from '../sheets-db/sheets-db-serializers';

interface EscalaKey {
  ano: number;
  mes: number;
}

function key(k: EscalaKey): string {
  return `${k.ano}-${String(k.mes).padStart(2, '0')}`;
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
 * em vez da equipe que veio na NOVA. Composição da quinzena segue a
 * NOVA escala (não há granularidade por dia na composição — todos os
 * dias de uma quinzena compartilham a mesma composição por equipe).
 *
 * Se `diasDescartados` está vazio, retorna `depois` inalterado (comportamento
 * padrão pré-S2.8.2).
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
      // Antes não tinha equipe naquele dia; manter atual = remover do dia.
      delete novoDiaEquipe[data];
    }
  }
  return { ...depois, diaEquipe: novoDiaEquipe };
}

/**
 * Computa o diff entre duas escalas do mesmo mês/ano. Útil para reupload — antes de
 * sobrescrever uma escala vigente, mostra o que vai mudar. Composição é comparada
 * separadamente por quinzena.
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
 * Mock service in-memory. Em S5 esse storage migra para Prisma+Supabase.
 */
@Injectable()
export class EscalasService implements OnModuleInit {
  private readonly logger = new Logger(EscalasService.name);
  private readonly byMes = new Map<string, EscalaMensal>();

  // S2.2 — SheetsDbService é injetado opcionalmente para permitir tests
  // que não precisam mockar Sheets-DB. Em runtime, sempre presente.
  constructor(@Optional() private readonly sheetsDb?: SheetsDbService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (this.byMes.size > 0) return;
    // S2.8.2 — Sheets-DB é fonte primária. Roda em qualquer ambiente
    // (inclusive produção). Em dev, se Sheets-DB vier vazio/desabilitado,
    // o XLSX local cobre como fallback.
    await this.bootstrapFromSheetsDb();
    if (this.byMes.size === 0 && process.env.NODE_ENV !== 'production') {
      await this.bootstrapFromFilesystem();
    }
  }

  /**
   * S2.8.2 — Lê todas as escalas mensais do Sheets-DB e popula o cache
   * in-memory. Idempotente. Sheets-DB desabilitado (sem credenciais) =
   * no-op silencioso, o caller cai no XLSX fallback.
   */
  private async bootstrapFromSheetsDb(): Promise<void> {
    if (!this.sheetsDb?.isEnabled()) {
      this.logger.log('Bootstrap escalas: Sheets-DB desabilitado, tentando XLSX local.');
      return;
    }
    try {
      const rows = await this.sheetsDb.readEscalaMensal();
      const escalas = rowsToEscalasMensais(rows);
      for (const [k, escala] of escalas.entries()) {
        this.byMes.set(k, escala);
      }
      this.logger.log(
        `Bootstrap escalas: ${escalas.size} meses carregados do Sheets-DB (${rows.length} linhas).`,
      );
    } catch (err) {
      this.logger.warn(
        `Bootstrap escalas Sheets-DB falhou: ${(err as Error).message}. Tentando XLSX local.`,
      );
    }
  }

  /**
   * Dev-only — ao iniciar, se o cache está vazio, lê os 2 arquivos XLSX mais
   * recentes em `data/Escala de Serviço/` e popula. Idempotente: roda uma
   * única vez no startup. Não dispara em produção.
   */
  private async bootstrapFromFilesystem(): Promise<void> {
    const dataDir = resolveDataDir('Escala de Serviço');
    if (!dataDir) {
      this.logger.warn('Bootstrap escalas: pasta "data/Escala de Serviço/" não encontrada — pulando.');
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
        this.byMes.set(key(escala), escala);
        this.logger.log(`Bootstrap escala: ${f} (${String(escala.mes).padStart(2, '0')}/${escala.ano})`);
      } catch (err) {
        this.logger.error(`Bootstrap escala falhou para "${f}": ${(err as Error).message}`);
      }
    }
  }

  list(): { escalas: { ano: number; mes: number; origemArquivo: string; importadoEm: string }[] } {
    const escalas = [...this.byMes.values()]
      .map((e) => ({
        ano: e.ano,
        mes: e.mes,
        origemArquivo: e.origemArquivo,
        importadoEm: e.importadoEm,
      }))
      .sort((a, b) => b.ano - a.ano || b.mes - a.mes);
    return { escalas };
  }

  get(ano: number, mes: number): EscalaMensal | null {
    return this.byMes.get(key({ ano, mes })) ?? null;
  }

  /**
   * Upserta a escala do mês. Se já existir, sobrescreve completamente — o caller é
   * responsável por confirmar o diff antes (via preview/confirm).
   *
   * S2.2 — dual-write: persiste in-memory (síncrono) e dispara replace
   * para o Sheets-DB em background (fire-and-forget). Falhas de Sheets
   * não derrubam a operação principal.
   */
  save(escala: EscalaMensal): EscalaMensal {
    this.byMes.set(key(escala), escala);
    this.syncToSheetsDb(escala);
    return escala;
  }

  delete(ano: number, mes: number): boolean {
    const removed = this.byMes.delete(key({ ano, mes }));
    if (removed) this.deleteFromSheetsDb(ano, mes);
    return removed;
  }

  private syncToSheetsDb(escala: EscalaMensal): void {
    if (!this.sheetsDb?.isEnabled()) return;
    const rows = escalaMensalToRows(escala);
    void this.sheetsDb.replaceEscalaMensalMes(escala.ano, escala.mes, rows).catch((err) => {
      this.logger.warn(
        `Sheets-DB write falhou para escala ${escala.mes}/${escala.ano}: ${(err as Error).message}. In-memory OK.`,
      );
    });
  }

  private deleteFromSheetsDb(ano: number, mes: number): void {
    if (!this.sheetsDb?.isEnabled()) return;
    void this.sheetsDb.replaceEscalaMensalMes(ano, mes, []).catch((err) => {
      this.logger.warn(
        `Sheets-DB delete falhou para escala ${mes}/${ano}: ${(err as Error).message}.`,
      );
    });
  }

  /**
   * Lista os escalados de uma equipe num dia específico (composição da equipe que
   * está escalada nesse dia). Resolve a quinzena pelo dia consultado — toda a
   * tradução dia→quinzena fica encapsulada aqui, downstream (Prévia/Fiscais) não
   * precisa conhecer o conceito de quinzena.
   */
  getEscaladosDoDia(
    ano: number,
    mes: number,
    diaIso: string,
  ): { equipe: LetraEquipeRotativa | null; entries: ComposicaoEntry[] } {
    const escala = this.get(ano, mes);
    if (!escala) return { equipe: null, entries: [] };
    const equipe = escala.diaEquipe[diaIso] ?? null;
    if (!equipe) return { equipe: null, entries: [] };
    const q = quinzenaDoDia(diaIso, escala);
    const bucket = q === 1 ? escala.composicaoPorQuinzena.q1 : escala.composicaoPorQuinzena.q2;
    const entries = bucket.filter((c) => c.equipe === equipe);
    return { equipe, entries };
  }

  /**
   * F4 — Atualiza a equipe escalada para um dia específico (ou remove se equipe=null).
   * Retorna a escala atualizada. Lança Error se mês/ano não foi importado.
   */
  updateDiaEquipe(
    ano: number,
    mes: number,
    data: string,
    equipe: LetraEquipeRotativa | null,
  ): EscalaMensal {
    const escala = this.get(ano, mes);
    if (!escala) {
      throw new Error(`Escala ${String(mes).padStart(2, '0')}/${ano} não importada`);
    }
    const novoMapa = { ...escala.diaEquipe };
    if (equipe === null) {
      delete novoMapa[data];
    } else {
      novoMapa[data] = equipe;
    }
    const atualizada: EscalaMensal = { ...escala, diaEquipe: novoMapa };
    this.byMes.set(key(escala), atualizada);
    return atualizada;
  }

  /**
   * F4 — Upsert/delete de uma posição da composição em uma quinzena específica.
   * Quando `militar=null`, remove. Quando preenchido, sobrescreve por chave
   * (equipe, viatura, funcao). A outra quinzena não é afetada.
   */
  upsertComposicao(
    ano: number,
    mes: number,
    quinzena: 1 | 2,
    entry:
      | ComposicaoEntry
      | { equipe: LetraEquipe; viatura: string; funcao: string; militar: null },
  ): EscalaMensal {
    const escala = this.get(ano, mes);
    if (!escala) {
      throw new Error(`Escala ${String(mes).padStart(2, '0')}/${ano} não importada`);
    }
    const matchKey = (c: { equipe: string; viatura: string; funcao: string }) =>
      `${c.equipe}|${c.viatura}|${c.funcao}`;
    const target = matchKey(entry);
    const bucketKey = quinzena === 1 ? 'q1' : 'q2';
    const filtered = escala.composicaoPorQuinzena[bucketKey].filter(
      (c) => matchKey(c) !== target,
    );
    if (entry.militar !== null) {
      filtered.push(entry as ComposicaoEntry);
    }
    const atualizada: EscalaMensal = {
      ...escala,
      composicaoPorQuinzena: {
        ...escala.composicaoPorQuinzena,
        [bucketKey]: filtered,
      },
    };
    this.byMes.set(key(escala), atualizada);
    return atualizada;
  }

  /** Reset usado nos testes. */
  reset(): void {
    this.byMes.clear();
  }
}
