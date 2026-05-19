import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IseoHospitalEntry } from '@argus/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { parseIseoHospitaisCsv, parseUnidadeFromSheetName } from './iseo-hospitais-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

const DEFAULT_SHEET_ID = '1wmFOEsrU219fGMfksoSY5dvQu0UN7HdQ558UUiWRXuw';

/**
 * S2.10.8c — Lista padrão de abas conhecidas. Pode ser sobrescrita via env
 * `ISEO_SHEET_NAMES` (CSV separado por vírgula). Mantém a mesma lista do
 * `IseoHospitaisService` original (pre-Prisma) para garantir paridade.
 */
const DEFAULT_SHEET_NAMES = [
  'HPM JANEIRO 2026',
  'HIMABA JANEIRO 2026',
  'HPM FEVEREIRO 2026',
  'HIMABA FEVEREIRO 2026',
  'HPM MARÇO 2026',
  'HIMABA MARÇO 2026',
  'ABRIL 2026',
  'MAIO 2026',
];

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  inconsistencias: string[];
  syncedAt: string;
}

/**
 * S2.10.8c — Importa as entradas da planilha externa "Escala ISEO Hospitais"
 * (multi-sheet: HPM + HIMABA × meses) e persiste em Postgres via upsert
 * idempotente.
 *
 * Padrão multi-sheet: itera `sheetNames()` (env-driven), faz fetch de cada
 * aba em paralelo, agrega o resultado num único SyncLog. Falha em 1 aba
 * NÃO bloqueia as demais (graceful degradation).
 *
 * Chave de idempotência: `(unidade, dataIso, turno, nfNorm)`. Como `nf`
 * pode ser null, normalizamos para `''` em uma busca por `findFirst`
 * (Postgres trata NULL como distinto em unique constraints, então não
 * podemos usar `findUnique` cego).
 */
@Injectable()
export class IseoHospitaisImportService {
  /** S2.10.8c — Identifier estável para o SyncOrchestrator. */
  readonly id = 'iseo-hospitais-import';
  /** Nome amigável exibido em /configuracoes/integracoes. */
  readonly nome = 'ISEO Hospitais → Postgres (upsert multi-sheet)';

  private readonly logger = new Logger(IseoHospitaisImportService.name);
  private lastSync: SyncResult | null = null;
  private lastSyncAtMs: number | null = null;
  private inflight: Promise<SyncResult> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
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
      this.logger.error(`syncIfStale ISEO Hospitais falhou: ${(err as Error).message}`);
    });
  }

  /** Força sync imediato (admin). */
  async forceSync(): Promise<SyncResult> {
    try {
      return await this.syncToDatabase();
    } catch (err) {
      this.logger.error(`forceSync ISEO Hospitais falhou: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha de ISEO Hospitais.',
      );
    }
  }

  /**
   * Lê todas as abas em paralelo + persiste via upsert por `(unidade,
   * dataIso, turno, nf)`. Falha em 1 aba é graceful (registrada em
   * inconsistências mas não interrompe as demais).
   */
  async syncToDatabase(): Promise<SyncResult> {
    if (this.inflight) return this.inflight;
    this.inflight = this.executeSyncToDatabase().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async executeSyncToDatabase(): Promise<SyncResult> {
    const sheets = this.sheetNames();
    const inconsistencias: string[] = [];

    // Fetch + parse em paralelo (cada aba pode falhar independentemente)
    const results = await Promise.all(
      sheets.map(async (sheet) => {
        try {
          const entries = await this.fetchAndParse(sheet);
          return { sheet, entries };
        } catch (err) {
          const msg = `Aba "${sheet}" falhou: ${(err as Error).message}`;
          this.logger.warn(`ISEO sync: ${msg}`);
          inconsistencias.push(msg);
          return { sheet, entries: [] as IseoHospitalEntry[] };
        }
      }),
    );

    // Dedup entre abas (mesma chave pode aparecer em sheets sobrepostas)
    const seen = new Set<string>();
    const flat: IseoHospitalEntry[] = [];
    for (const { entries } of results) {
      for (const e of entries) {
        const key = `${e.unidade}|${e.dataIso}|${e.turno}|${e.nf ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        flat.push(e);
      }
    }

    let created = 0;
    let updated = 0;
    const skipped = 0;

    for (const e of flat) {
      // findFirst em vez de findUnique pois `nf` é nullable (Postgres trata
      // NULL como distinto em unique constraints).
      const existing = await this.prisma.iseoHospitalEntry.findFirst({
        where: {
          unidade: e.unidade,
          dataIso: e.dataIso,
          turno: e.turno,
          nf: e.nf ?? null,
        },
        select: { id: true },
      });

      const data = {
        unidade: e.unidade,
        posto: e.posto,
        nome: e.nome,
        nf: e.nf ?? null,
        dataIso: e.dataIso,
        turno: e.turno,
        funcao: e.funcao ?? null,
        contato: e.contato ?? null,
        cargaHoraria: e.cargaHoraria ?? null,
        obm: e.obm ?? null,
        lotacao: e.lotacao ?? null,
        sincronizadoEm: new Date(),
      };

      if (existing) {
        await this.prisma.iseoHospitalEntry.update({
          where: { id: existing.id },
          data,
        });
        updated++;
      } else {
        await this.prisma.iseoHospitalEntry.create({ data });
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
      `ISEO Hospitais sync OK: created=${created}, updated=${updated}, abas=${sheets.length}, falhas=${inconsistencias.length}`,
    );
    return result;
  }

  private sheetNames(): string[] {
    const raw = this.config.get<string>('ISEO_SHEET_NAMES');
    if (raw && raw.trim()) {
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return DEFAULT_SHEET_NAMES;
  }

  private async fetchAndParse(sheet: string): Promise<IseoHospitalEntry[]> {
    const sheetId = this.config.get<string>('ISEO_HOSPITAIS_SHEET_ID') ?? DEFAULT_SHEET_ID;
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
      sheet,
    )}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ao baixar ISEO "${sheet}"`);
      }
      const csv = await res.text();
      const unidadeFromSheet = parseUnidadeFromSheetName(sheet);
      // Igual ao IseoHospitaisService original: abas unificadas
      // (ABRIL/MAIO 2026) usam paredLayout; abas prefixadas usam
      // unidadeFromSheet.
      return parseIseoHospitaisCsv(
        csv,
        unidadeFromSheet
          ? { unidadeFromSheet }
          : { paredLayout: { unidadePrimeiroPar: 'HPM', unidadeSegundoPar: 'HIMABA' } },
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
