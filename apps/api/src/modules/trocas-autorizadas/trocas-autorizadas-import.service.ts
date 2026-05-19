import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Militar as MilitarShared } from '@argus/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EfetivoService } from '../efetivo/efetivo.service';
import { parseTrocasAutorizadasCsv } from './trocas-autorizadas-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  inconsistencias: string[];
  syncedAt: string;
}

/**
 * S2.10.8b — Importa as trocas autorizadas da planilha externa do Comando
 * e persiste em Postgres via upsert idempotente (chave: `id` = hash
 * determinístico da linha).
 *
 * Padrão: fetch CSV público + cache TTL 5min + inflight lock. Auto-sync
 * fire-and-forget chamado pelo `TrocasAutorizadasService.listAll()` /
 * `listByData()` em cada GET (não bloqueia).
 *
 * Auto-upsert Militar (S2.10.7e pattern): se `escaladoOriginalNf` ou
 * `substitutoNf` não existem em `prisma.militar` mas existem no
 * `EfetivoService.getAll()`, persiste primeiro (FKs futuras dependem
 * disso; atualmente o schema TrocaAutorizada não tem FK declarada para
 * Militar, mas mantemos coerência).
 */
@Injectable()
export class TrocasAutorizadasImportService {
  /** S2.10.8b — Identifier estável para o SyncOrchestrator. */
  readonly id = 'trocas-autorizadas-import';
  /** S2.10.8b — Nome amigável exibido em /configuracoes/integracoes. */
  readonly nome = 'Trocas Autorizadas → Postgres (upsert)';

  private readonly logger = new Logger(TrocasAutorizadasImportService.name);
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

  /** Dispara sync se cache expirou (>5min) ou nunca foi feita. Fire-and-forget. */
  async syncIfStale(): Promise<void> {
    const now = Date.now();
    if (this.lastSyncAtMs && now - this.lastSyncAtMs < CACHE_TTL_MS) return;
    if (this.inflight) {
      await this.inflight.catch(() => undefined);
      return;
    }
    void this.syncToDatabase().catch((err) => {
      this.logger.error(`syncIfStale Trocas Autorizadas falhou: ${(err as Error).message}`);
    });
  }

  /** Força sync imediato (admin). */
  async forceSync(): Promise<SyncResult> {
    try {
      return await this.syncToDatabase();
    } catch (err) {
      this.logger.error(`forceSync Trocas Autorizadas falhou: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha de Trocas Autorizadas.',
      );
    }
  }

  /**
   * Lê planilha + persiste via upsert por `id` (hash determinístico da linha).
   * Auto-upsert Militar quando NFs apresentadas resolvem no efetivo consolidado.
   */
  async syncToDatabase(): Promise<SyncResult> {
    if (this.inflight) return this.inflight;
    this.inflight = this.executeSyncToDatabase().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async executeSyncToDatabase(): Promise<SyncResult> {
    const trocas = await this.fetchAndParse();
    const efetivoTotal = await this.efetivo.getAll({
      somente1aCia: false,
      incluirEfetivoOrfao: true,
    });
    const efetivoByNf = new Map(efetivoTotal.map((m) => [m.nf, m]));

    let created = 0;
    let updated = 0;
    const skipped = 0;
    const inconsistencias: string[] = [];

    for (const t of trocas) {
      // S2.10.8b — Auto-upsert Militar se NF presente e ainda não em Postgres
      // (mantém coerência com S2.10.7e/dispensas; útil para análise cruzada).
      await this.ensureMilitar(t.escaladoOriginalNf, efetivoByNf, inconsistencias);
      await this.ensureMilitar(t.substitutoNf, efetivoByNf, inconsistencias);

      const existing = await this.prisma.trocaAutorizada.findUnique({
        where: { id: t.id },
        select: { id: true },
      });

      const data = {
        registradoEm: t.registradoEm,
        emailRegistrante: t.emailRegistrante ?? null,
        statusTroca: t.statusTroca ?? null,
        statusNome: t.statusNome ?? null,
        dataEscala: t.dataEscala,
        escaladoOriginal: t.escaladoOriginal,
        escaladoOriginalNf: t.escaladoOriginalNf ?? null,
        substituto: t.substituto,
        substitutoNf: t.substitutoNf ?? null,
        funcao: t.funcao,
        horario: t.horario,
        dataPagamento: t.dataPagamento,
        escaladoPagamento: t.escaladoPagamento,
        substitutoPagamento: t.substitutoPagamento,
        funcaoPagamento: t.funcaoPagamento,
        horarioPagamento: t.horarioPagamento,
        isDobra48h: t.isDobra48h,
        numeroEdocs: t.numeroEdocs ?? null,
        numeroRegistro: t.numeroRegistro ?? null,
        sincronizadoEm: new Date(),
      };

      if (existing) {
        await this.prisma.trocaAutorizada.update({
          where: { id: t.id },
          data,
        });
        updated++;
      } else {
        await this.prisma.trocaAutorizada.create({
          data: { id: t.id, ...data },
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
      `Trocas Autorizadas sync OK: created=${created}, updated=${updated}, skipped=${skipped}, inconsistencias=${inconsistencias.length}`,
    );
    return result;
  }

  /**
   * S2.10.8b — Garante que Militar com `nf` existe em Postgres (auto-upsert
   * a partir do efetivo consolidado). No-op se nf vazio ou já presente.
   */
  private async ensureMilitar(
    nf: string | undefined,
    efetivoByNf: Map<string, MilitarShared>,
    inconsistencias: string[],
  ): Promise<void> {
    if (!nf) return;
    const existing = await this.prisma.militar.findUnique({
      where: { nf },
      select: { nf: true },
    });
    if (existing) return;
    const fromEfetivo = efetivoByNf.get(nf);
    if (!fromEfetivo) {
      inconsistencias.push(
        `Militar NF ${nf} (citado em troca) não existe nem em Postgres nem no Efetivo consolidado`,
      );
      return;
    }
    const data = militarToPrismaData(fromEfetivo);
    await this.prisma.militar.upsert({
      where: { nf },
      create: data,
      update: data,
    });
  }

  private async fetchAndParse() {
    const sheetId =
      this.config.get<string>('TROCAS_AUT_SHEET_ID') ??
      '1IjD4XskscfL5w4bCw5lP5qTNIZi5307XJKc3yGWK4D8';
    const gid = this.config.get<string>('TROCAS_AUT_SHEET_GID') ?? '1799360305';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ao baixar Trocas Autorizadas`);
      }
      const csv = await res.text();
      return parseTrocasAutorizadasCsv(csv);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * S2.10.8b — Reusa o pattern de `dispensas-import.service.ts:222-260`.
 * Mapeia campos opcionais do shared-types Militar para `null` (Prisma
 * não aceita `undefined`).
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
