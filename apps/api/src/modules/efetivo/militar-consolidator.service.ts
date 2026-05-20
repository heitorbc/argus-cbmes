import { forwardRef, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Militar } from '@argus/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ChefesOperacoesService } from '../chefes-operacoes/chefes-operacoes.service';
import { EfetivoService, mergeThreeSources } from './efetivo.service';
import type { MilitarDados } from './qdi-dados-csv-parser';
import { QdiDadosService } from './qdi-dados.service';
import type { MilitarQdi } from './qdi-csv-parser';
import { QdiService } from './qdi.service';

export interface ConsolidationResult {
  created: number;
  updated: number;
  skipped: number;
  inconsistencias: string[];
}

/**
 * S2.10.8d — Consolidador 3-way (EFETIVO + QDI 1ª1º + QDI/DADOS) que persiste
 * o resultado em `prisma.militar`.
 *
 * Compartilhado pelos 3 ImportServices (Efetivo, QDI, QDI-DADOS). Cada sync
 * de qualquer das 3 fontes dispara uma consolidação completa — a consolidação
 * lê o cache em memória das 3 fontes e faz upsert em massa.
 *
 * **Inflight lock**: chamadas concorrentes compartilham a mesma Promise. Os
 * 3 sources rodam em paralelo no `SyncOrchestrator.syncAll()`, mas só haverá
 * 1 consolidação física. Todos recebem o mesmo resultado.
 *
 * **Counts no SyncLog**: cada um dos 3 SyncLogs (efetivo/qdi/dados) registra
 * os mesmos counts da consolidação compartilhada. Não é redundância em
 * memória; é apenas o registro de auditoria mostrando que aquela fonte
 * "participou" do ciclo. O created/updated reflete o trabalho TOTAL feito em
 * `prisma.militar`.
 *
 * Persiste com `incluirEfetivoOrfao=true` (Postgres armazena tudo;
 * `EfetivoService.list/getAll` filtra em runtime conforme query).
 */
@Injectable()
export class MilitarConsolidatorService {
  private readonly logger = new Logger(MilitarConsolidatorService.name);
  private inflight: Promise<ConsolidationResult> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly efetivo: EfetivoService,
    private readonly qdi: QdiService,
    private readonly qdiDados: QdiDadosService,
    @Optional()
    @Inject(forwardRef(() => ChefesOperacoesService))
    private readonly chefesOperacoes?: ChefesOperacoesService,
  ) {}

  /** Consolida 3 fontes + persiste. Lock interno: chamadas concorrentes compartilham resultado. */
  async consolidateAndUpsert(): Promise<ConsolidationResult> {
    if (this.inflight) return this.inflight;
    this.inflight = this.execute().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async execute(): Promise<ConsolidationResult> {
    const inconsistencias: string[] = [];

    // Lê os 3 caches (force refresh se TTL expirou — ImportService normalmente
    // invalida o cache da SUA fonte antes de chamar; as outras 2 servem do
    // cache se ainda quente).
    let efetivoByNf = new Map<string, Militar>();
    let dadosByNf = new Map<string, MilitarDados>();
    let qdiByNf = new Map<string, MilitarQdi>();

    try {
      const r = await this.efetivo.getRawEfetivoByNf();
      efetivoByNf = r.byNf;
    } catch (err) {
      inconsistencias.push(`EFETIVO indisponível: ${(err as Error).message}`);
    }
    try {
      const r = await this.qdiDados.getByNf();
      dadosByNf = r.byNf;
    } catch (err) {
      inconsistencias.push(`QDI/DADOS indisponível: ${(err as Error).message}`);
    }
    try {
      const r = await this.qdi.getByNf();
      qdiByNf = r.byNf;
    } catch (err) {
      inconsistencias.push(`QDI/1ª1º indisponível: ${(err as Error).message}`);
    }

    this.logger.log(
      `Consolidator: EFETIVO=${efetivoByNf.size}, DADOS=${dadosByNf.size}, QDI=${qdiByNf.size}`,
    );

    const merged = mergeThreeSources(dadosByNf, qdiByNf, efetivoByNf, {
      incluirEfetivoOrfao: true,
    });

    // ChOps enrichment — espelha lógica do EfetivoService.consolidate() lines 221-248.
    // Persiste papelEspecial junto, pra ler de Postgres depois sem recomputar.
    if (this.chefesOperacoes) {
      try {
        const chopsNfs = await this.chefesOperacoes.getHabilitadosNfs();
        if (chopsNfs.size > 0) {
          const presentes = new Set(merged.map((m) => m.nf));
          for (const m of merged) {
            if (chopsNfs.has(m.nf)) m.papelEspecial = 'Chefe de Operações';
          }
          const ausentes = new Set([...chopsNfs].filter((nf) => !presentes.has(nf)));
          if (ausentes.size > 0) {
            const extras = await this.qdiDados.findUnfilteredByNfs(ausentes);
            for (const [nf, d] of extras) {
              merged.push({
                nf,
                ant: d.ant,
                posto: d.posto,
                nome: d.nome,
                nomeGuerra: d.nomeGuerra,
                lotacao: d.lotacao,
                municipio: d.municipio,
                situacao: d.situacao,
                origensFonte: ['DADOS'],
                papelEspecial: 'Chefe de Operações',
              });
            }
          }
        }
      } catch (err) {
        inconsistencias.push(`ChOps enrichment falhou: ${(err as Error).message}`);
      }
    }

    // Upsert por NF (idempotente). Não removemos NFs ausentes do Postgres
    // pra não quebrar FKs de Dispensa/Atestado/Ferias — soft removal é
    // assunto futuro.
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const m of merged) {
      try {
        if (!m.posto || !m.nome) {
          skipped++;
          inconsistencias.push(`NF ${m.nf} sem posto ou nome — pulado`);
          continue;
        }
        const data = militarToPrismaData(m);
        const existing = await this.prisma.militar.findUnique({
          where: { nf: m.nf },
          select: { nf: true },
        });
        if (existing) {
          await this.prisma.militar.update({ where: { nf: m.nf }, data });
          updated++;
        } else {
          await this.prisma.militar.create({ data });
          created++;
        }
      } catch (err) {
        skipped++;
        inconsistencias.push(`Upsert Militar NF ${m.nf} falhou: ${(err as Error).message}`);
      }
    }

    this.logger.log(
      `Consolidator OK: total=${merged.length}, created=${created}, updated=${updated}, skipped=${skipped}, inconsistencias=${inconsistencias.length}`,
    );

    return { created, updated, skipped, inconsistencias };
  }
}

/**
 * S2.10.8d — Mapeia `Militar` (shared-types) para o shape de `prisma.militar`
 * (undefined → null, exceto `sincronizadoEm` que é sempre atualizado).
 */
function militarToPrismaData(m: Militar) {
  return {
    nf: m.nf,
    ant: m.ant,
    posto: m.posto,
    nome: m.nome,
    nomeGuerra: m.nomeGuerra ?? null,
    funcao: m.funcao ?? null,
    unidade: m.unidade ?? null,
    subSecao: m.subSecao ?? null,
    postoPrevisto: m.postoPrevisto ?? null,
    municipio: m.municipio ?? null,
    idade: m.idade ?? null,
    servico: m.servico ?? null,
    situacao: m.situacao ?? null,
    lotacao: m.lotacao ?? null,
    classe: m.classe ?? null,
    conceitoDisciplinar: m.conceitoDisciplinar ?? null,
    pontos: m.pontos ?? null,
    cnh: m.cnh ?? null,
    cnhValidade: m.cnhValidade ?? null,
    incorporacao: m.incorporacao ?? null,
    planoFerias: m.planoFerias ?? null,
    mergulho: m.mergulho ?? null,
    ftba: m.ftba ?? null,
    etsp: m.etsp ?? null,
    ccve: m.ccve ?? null,
    ccveValidade: m.ccveValidade ?? null,
    censo: m.censo ?? null,
    origensFonte: m.origensFonte ?? [],
    papelEspecial: m.papelEspecial ?? null,
    sincronizadoEm: new Date(),
  };
}
