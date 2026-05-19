import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Militar as MilitarShared } from '@argus/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EfetivoService } from '../efetivo/efetivo.service';
import { parseMilitarCell } from '../escalas/escala-xlsx-parser';
import { NomeMatcher } from '../mapa-forca/nome-matching';
import {
  parseDispensas2026Csv,
  type DispensaImportadaLinha,
} from './dispensas-2026-import-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  /** Mensagens de NFs não resolvidas, datas inválidas, etc. */
  inconsistencias: string[];
  syncedAt: string;
}

/**
 * S2.10.7d — Importa dispensas da planilha externa "Efetivo - Dados Gerais",
 * aba "Dispensas 2026", para a tabela `dispensas` do Postgres via upsert
 * idempotente (chave: militarNf + dataInicio + tipo).
 *
 * Padrão: fetch CSV público + cache TTL 5min + inflight lock + fallback stale.
 * `syncIfStale()` é chamado pelo DispensasService em cada listagem (fire-and-
 * forget — não bloqueia o GET).
 *
 * Reconciliação NF→Militar:
 *   1. Se a linha tem NF na col A, usa direto
 *   2. Senão, NomeMatcher tenta resolver via militarRaw (col B)
 *   3. Se não resolve, linha vira inconsistência e é pulada
 */
@Injectable()
export class DispensasImportService {
  /** S2.10.8a — Identifier estável para o SyncOrchestrator. */
  readonly id = 'dispensas-import';
  /** S2.10.8a — Nome amigável exibido em /configuracoes/integracoes. */
  readonly nome = 'Dispensas 2026 → Postgres (upsert)';

  private readonly logger = new Logger(DispensasImportService.name);
  private lastSync: SyncResult | null = null;
  private lastSyncAtMs: number | null = null;
  private inflight: Promise<SyncResult> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly efetivo: EfetivoService,
  ) {}

  /** Status visível em `/configuracoes/integracoes`. */
  getSyncStatus(): {
    syncedAt: string | null;
    counts: Pick<SyncResult, 'created' | 'updated' | 'skipped'> | null;
    stale: boolean;
    inconsistencias: number;
  } {
    if (!this.lastSync || this.lastSyncAtMs === null) {
      return { syncedAt: null, counts: null, stale: false, inconsistencias: 0 };
    }
    return {
      syncedAt: this.lastSync.syncedAt,
      counts: {
        created: this.lastSync.created,
        updated: this.lastSync.updated,
        skipped: this.lastSync.skipped,
      },
      stale: Date.now() - this.lastSyncAtMs >= CACHE_TTL_MS,
      inconsistencias: this.lastSync.inconsistencias.length,
    };
  }

  /** Dispara sync se cache expirou (>5min) ou nunca foi feita. */
  async syncIfStale(): Promise<void> {
    const now = Date.now();
    if (this.lastSyncAtMs && now - this.lastSyncAtMs < CACHE_TTL_MS) return;
    if (this.inflight) {
      await this.inflight.catch(() => undefined);
      return;
    }
    // Fire-and-forget: dispara mas não bloqueia caller. Erros viram log.
    void this.syncToDatabase().catch((err) => {
      this.logger.error(`syncIfStale Dispensas falhou: ${(err as Error).message}`);
    });
  }

  /** Força sync imediato (admin). Lança ServiceUnavailable se rede/parse falhar. */
  async forceSync(): Promise<SyncResult> {
    try {
      return await this.syncToDatabase();
    } catch (err) {
      this.logger.error(`forceSync Dispensas falhou: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha de Dispensas.',
      );
    }
  }

  /**
   * Lê planilha + persiste via upsert por (militarNf, dataInicio, tipo).
   * Dispensas locais (origem='manual') sobrevivem ao sync; quando há
   * conflito de chave, o upsert atualiza dias/numeroEdocs/observacoes/
   * minuta/equipe SEM mexer em origem ou criadoPorNf.
   */
  async syncToDatabase(): Promise<SyncResult> {
    if (this.inflight) return this.inflight;
    this.inflight = this.executeSyncToDatabase().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async executeSyncToDatabase(): Promise<SyncResult> {
    const linhas = await this.fetchAndParse();
    const efetivoTotal = await this.efetivo.getAll({
      somente1aCia: false,
      incluirEfetivoOrfao: true,
    });
    const matcher = new NomeMatcher(efetivoTotal);
    // S2.10.7e — index NF→Militar para auto-upsert quando Militar não existe
    // em Postgres mas existe no efetivo consolidado.
    const efetivoByNf = new Map(efetivoTotal.map((m) => [m.nf, m]));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const inconsistencias: string[] = [];

    for (const linha of linhas) {
      // Resolve NF: direto da col A ou via matcher
      let militarNf: string | undefined = linha.nfRaw;
      if (!militarNf) {
        const ref = parseMilitarCell(linha.militarRaw);
        const resolved = ref ? matcher.resolve(ref).resolved : null;
        militarNf = resolved?.nf;
      }
      if (!militarNf) {
        skipped++;
        inconsistencias.push(
          `Linha sem NF resolvida: "${linha.militarRaw}" em ${linha.data} (tipo ${linha.tipo})`,
        );
        continue;
      }

      // Verifica se o militar existe no banco (FK constraint)
      const militarExiste = await this.prisma.militar.findUnique({
        where: { nf: militarNf },
        select: { nf: true },
      });
      if (!militarExiste) {
        // S2.10.7e — Auto-upsert a partir do EfetivoService (decisão D2 do
        // plano). Se o militar existe no efetivo consolidado em memória,
        // persiste em Prisma antes de seguir. Caso contrário, registra
        // inconsistência (NF realmente desconhecido).
        const fromEfetivo = efetivoByNf.get(militarNf);
        if (!fromEfetivo) {
          skipped++;
          inconsistencias.push(
            `Militar NF ${militarNf} ("${linha.militarRaw}") não existe nem em Postgres nem no Efetivo consolidado`,
          );
          continue;
        }
        const data = militarToPrismaData(fromEfetivo);
        await this.prisma.militar.upsert({
          where: { nf: militarNf },
          create: data,
          update: data,
        });
      }

      // Upsert idempotente por (militarNf, dataInicio, tipo)
      const existing = await this.prisma.dispensa.findUnique({
        where: {
          militarNf_dataInicio_tipo: {
            militarNf,
            dataInicio: linha.data,
            tipo: linha.tipo,
          },
        },
      });

      if (existing) {
        // Reactivate soft-deleted se necessário + atualiza campos
        await this.prisma.dispensa.update({
          where: { id: existing.id },
          data: {
            dias: linha.dias,
            numeroEdocs: linha.edocs ?? null,
            observacoes: linha.observacoes ?? null,
            minuta: linha.minuta ?? null,
            equipe: linha.equipe ?? null,
            deletedAt: null,
          },
        });
        updated++;
      } else {
        await this.prisma.dispensa.create({
          data: {
            militarNf,
            tipo: linha.tipo,
            dataInicio: linha.data,
            dias: linha.dias,
            numeroEdocs: linha.edocs ?? null,
            observacoes: linha.observacoes ?? null,
            minuta: linha.minuta ?? null,
            equipe: linha.equipe ?? null,
            origem: 'planilha',
            // criadoPorNf null = sync automática (sem User humano)
          },
        });
        created++;
      }
    }

    const result: SyncResult = {
      created,
      updated,
      skipped,
      inconsistencias,
      syncedAt: new Date().toISOString(),
    };
    this.lastSync = result;
    this.lastSyncAtMs = Date.now();
    this.logger.log(
      `Dispensas sync OK: created=${created}, updated=${updated}, skipped=${skipped}, inconsistencias=${inconsistencias.length}`,
    );
    return result;
  }

  private async fetchAndParse(): Promise<DispensaImportadaLinha[]> {
    const sheetId =
      this.config.get<string>('DISPENSAS_PLANILHA_SHEET_ID') ??
      '1gA17VKQNV8xlnqIhAJfu57TW1GS6VH2YDrcJZk405do';
    const gid = this.config.get<string>('DISPENSAS_PLANILHA_SHEET_GID') ?? '1986271842';
    const anoDefault = Number(this.config.get<string>('DISPENSAS_PLANILHA_ANO') ?? '2026');
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}&headers=0`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ao baixar Dispensas 2026`);
      }
      const csv = await res.text();
      return parseDispensas2026Csv(csv, anoDefault);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * S2.10.7e — Converte um `Militar` do shared-types (consolidado pelo
 * EfetivoService) para o shape esperado pelo `prisma.militar.upsert`.
 * Mapeia campos opcionais → `null` (Prisma não aceita `undefined`).
 */
function militarToPrismaData(m: MilitarShared) {
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
