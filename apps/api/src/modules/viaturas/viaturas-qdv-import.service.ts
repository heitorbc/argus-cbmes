import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ContatoLogistico,
  ViaturaCbmes,
  ViaturaQdv,
  ViaturaQdvBaseLista,
} from '@argus/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  parseContatosLogisticasCsv,
  parseQdvBaseListaCsv,
  parseVtrListaPrincipalCsv,
} from './viaturas-qdv-extras-csv-parser';
import { parseViaturasQdvCsv } from './viaturas-qdv-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

const SHEETS = [
  '1BBM_1CIA',
  'BASE_LISTA',
  'BASE_VTR_LISTA_PRINCIPAL',
  'Contatos_LOGISTICAS',
] as const;
type SheetName = (typeof SHEETS)[number];

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  inconsistencias: string[];
  syncedAt: string;
}

/**
 * S2.10.9a — Importa as 4 abas QDV (Quadro Demonstrativo de Viaturas) e
 * persiste em 4 tabelas separadas (`viaturas_qdv`, `viaturas_qdv_base_lista`,
 * `viaturas_cbmes`, `contatos_logisticos`).
 *
 * Pattern: multi-sheet em paralelo (igual ISEO em S2.10.8c). Falha em 1 aba
 * NÃO bloqueia as demais (try/catch por aba). Replace-all por aba (cada
 * sync apaga o estado anterior daquela aba e insere o novo).
 */
@Injectable()
export class ViaturasQdvImportService {
  /** S2.10.9a — Identifier estável para o SyncOrchestrator. */
  readonly id = 'viaturas-qdv-import';
  readonly nome = 'QDV (4 abas) → Postgres (replace-all multi-sheet)';

  private readonly logger = new Logger(ViaturasQdvImportService.name);
  private lastSync: SyncResult | null = null;
  private lastSyncAtMs: number | null = null;
  private inflight: Promise<SyncResult> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

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

  async forceSync(): Promise<SyncResult> {
    try {
      return await this.syncToDatabase();
    } catch (err) {
      this.logger.error(`forceSync QDV falhou: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Não foi possível sincronizar com a planilha QDV.');
    }
  }

  async syncToDatabase(): Promise<SyncResult> {
    if (this.inflight) return this.inflight;
    this.inflight = this.executeSyncToDatabase().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async executeSyncToDatabase(): Promise<SyncResult> {
    const inconsistencias: string[] = [];
    let created = 0;
    let skipped = 0;

    // Fetch 4 abas em paralelo (cada uma pode falhar independentemente).
    const results = await Promise.all(
      SHEETS.map(async (sheet) => {
        try {
          const csv = await this.fetchCsv(sheet);
          return { sheet, csv, err: null as Error | null };
        } catch (err) {
          return { sheet, csv: '', err: err as Error };
        }
      }),
    );

    for (const r of results) {
      if (r.err) {
        skipped++;
        const msg = `Aba "${r.sheet}" falhou no fetch: ${r.err.message}`;
        this.logger.warn(`QDV sync: ${msg}`);
        inconsistencias.push(msg);
        continue;
      }
      try {
        const n = await this.persistSheet(r.sheet, r.csv);
        created += n;
      } catch (err) {
        skipped++;
        const msg = `Aba "${r.sheet}" falhou no upsert: ${(err as Error).message}`;
        this.logger.warn(`QDV sync: ${msg}`);
        inconsistencias.push(msg);
      }
    }

    const result: SyncResult = {
      created,
      updated: 0, // replace-all
      skipped,
      inconsistencias,
      syncedAt: new Date().toISOString(),
    };
    this.lastSync = result;
    this.lastSyncAtMs = Date.now();
    this.logger.log(
      `QDV sync OK: created=${created}, abas=${SHEETS.length}, falhas=${inconsistencias.length}`,
    );
    return result;
  }

  /** Persiste 1 aba via replace-all (transaction: deleteMany + createMany). */
  private async persistSheet(sheet: SheetName, csv: string): Promise<number> {
    if (sheet === '1BBM_1CIA') {
      const parsed = parseViaturasQdvCsv(csv);
      return this.prisma.$transaction(async (tx) => {
        await tx.viaturaQdv.deleteMany({});
        if (parsed.length === 0) return 0;
        const r = await tx.viaturaQdv.createMany({
          data: parsed.map(toViaturaQdvRow),
          skipDuplicates: true,
        });
        return r.count;
      });
    }
    if (sheet === 'BASE_LISTA') {
      const parsed = parseQdvBaseListaCsv(csv);
      return this.prisma.$transaction(async (tx) => {
        await tx.viaturaQdvBaseLista.deleteMany({});
        if (parsed.length === 0) return 0;
        const r = await tx.viaturaQdvBaseLista.createMany({
          data: parsed.map(toViaturaQdvBaseListaRow),
          skipDuplicates: true,
        });
        return r.count;
      });
    }
    if (sheet === 'BASE_VTR_LISTA_PRINCIPAL') {
      const parsed = parseVtrListaPrincipalCsv(csv);
      return this.prisma.$transaction(async (tx) => {
        await tx.viaturaCbmes.deleteMany({});
        if (parsed.length === 0) return 0;
        const r = await tx.viaturaCbmes.createMany({
          data: parsed.map(toViaturaCbmesRow),
          skipDuplicates: true,
        });
        return r.count;
      });
    }
    // Contatos_LOGISTICAS
    const parsed = parseContatosLogisticasCsv(csv);
    return this.prisma.$transaction(async (tx) => {
      await tx.contatoLogistico.deleteMany({});
      if (parsed.length === 0) return 0;
      const r = await tx.contatoLogistico.createMany({
        data: parsed.map(toContatoLogisticoRow),
        skipDuplicates: true,
      });
      return r.count;
    });
  }

  private async fetchCsv(sheet: SheetName): Promise<string> {
    const sheetId =
      this.config.get<string>('QDV_SHEET_ID') ?? '1iqjSDXpbAjtbi7lvd5_5brims8Ipr-OTVXhQMGiv2I8';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar QDV/${sheet}`);
      return await res.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function toViaturaQdvRow(v: ViaturaQdv) {
  return {
    prefixo: v.prefixo,
    status: v.status ?? null,
    emprestadaA: v.emprestadaA ?? null,
    kmAtual: v.kmAtual ?? null,
    observacao: v.observacao ?? null,
    empregoPrimario: v.empregoPrimario ?? null,
    empregoSecundario: v.empregoSecundario ?? null,
    placa: v.placa ?? null,
    marcaModelo: v.marcaModelo ?? null,
    combustivel: v.combustivel ?? null,
    obm: v.obm ?? null,
    sincronizadoEm: new Date(),
  };
}

function toViaturaQdvBaseListaRow(v: ViaturaQdvBaseLista) {
  return {
    prefixo: v.prefixo,
    obm: v.obm,
    nomenclatura: v.nomenclatura ?? null,
    ano: v.ano ?? null,
    status: v.status ?? null,
    emprestadaA: v.emprestadaA ?? null,
    kmAtual: v.kmAtual ?? null,
    observacao: v.observacao ?? null,
    empregoPrimario: v.empregoPrimario ?? null,
    empregoSecundario: v.empregoSecundario ?? null,
    placa: v.placa ?? null,
    renavam: v.renavam ?? null,
    categoriaCnh: v.categoriaCnh ?? null,
    marcaModelo: v.marcaModelo ?? null,
    combustivel: v.combustivel ?? null,
    modeloPneu: v.modeloPneu ?? null,
    sincronizadoEm: new Date(),
  };
}

function toViaturaCbmesRow(v: ViaturaCbmes) {
  return {
    prefixo: v.prefixo,
    prefixoComUnderscore: v.prefixoComUnderscore,
    obm: v.obm,
    nomenclatura: v.nomenclatura ?? null,
    ano: v.ano ?? null,
    idade: v.idade ?? null,
    observacao: v.observacao ?? null,
    placa: v.placa ?? null,
    renavam: v.renavam ?? null,
    categoriaCnh: v.categoriaCnh ?? null,
    tipoVeiculo: v.tipoVeiculo ?? null,
    marcaModelo: v.marcaModelo ?? null,
    combustivel: v.combustivel ?? null,
    modeloPneu: v.modeloPneu ?? null,
    sincronizadoEm: new Date(),
  };
}

function toContatoLogisticoRow(c: ContatoLogistico) {
  return {
    obm: c.obm,
    nf: c.nf,
    militarResponsavel: c.militarResponsavel,
    nomeCompleto: c.nomeCompleto ?? null,
    telefone: c.telefone ?? null,
    email: c.email ?? null,
    sincronizadoEm: new Date(),
  };
}
