import { Injectable, Logger, type OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  clearAndWrite,
  createSheetIfMissing,
  getSheetsClient,
  readAll,
  upsertByKey,
} from '../../common/google-sheets-writer';

/**
 * "Banco de dados" da Fase 1 sobre Google Sheets, antecipando o S5b
 * (migração para Supabase). Uma planilha-DB com 3 abas serve como fonte
 * primária para Escala Mensal, Escala Especial e Notas de Serviço.
 *
 * Arquitetura:
 *   - Cada aba tem schema fixo definido aqui (`SHEETS`).
 *   - `bootstrap()` no `OnModuleInit` cria abas faltantes (idempotente).
 *   - `read*()` retorna matriz parseada (string[][] sem header).
 *   - `upsertEscalaMensalDia()` etc.: merge por chave (data, ato, NS id).
 *
 * Auth: Service Account exclusiva (`GOOGLE_SHEETS_SA_KEY_BASE64`),
 * planilha em `SHEETS_DB_ID`. Em dev sem env vars, o service entra em
 * "modo desabilitado" — não bloqueia o startup; apenas loga warning.
 */

export const SHEETS = {
  ESCALA_MENSAL: {
    name: 'bd_escala_mensal',
    headers: [
      'ano',
      'mes',
      'data',
      'equipe',
      'recurso',
      'viatura',
      'funcao',
      'militarRaw',
      'militarNf',
      'origemArquivo',
      'importadoEm',
      'importadoPorNf',
    ],
    /** chave composta serializada em col 2 (data) + col 5 (viatura) + col 6 (funcao) — keyColIdx aponta para `data`. */
    keyColIdx: 2,
  },
  ESCALA_ESPECIAL: {
    name: 'bd_escala_especial',
    headers: [
      'ano',
      'mes',
      'data',
      'militarRaw',
      'militarNf',
      'horario',
      'funcao',
      'origemArquivo',
      'importadoEm',
      'importadoPorNf',
    ],
    keyColIdx: 2,
  },
  NOTAS_SERVICO: {
    name: 'bd_notas_servico',
    headers: [
      'id',
      'codigo',
      'descricao',
      'data',
      'horaInicio',
      'horaFim',
      'viaturaPrefixo',
      'militaresNfs',
      'observacoes',
      'criadoEm',
      'criadoPorNf',
    ],
    keyColIdx: 0,
  },
} as const;

export interface SheetsDbStatus {
  enabled: boolean;
  spreadsheetId: string | null;
  bootstrappedAt: string | null;
  abas: Array<{ nome: string; existe: boolean }>;
  ultimoErro: string | null;
}

@Injectable()
export class SheetsDbService implements OnModuleInit {
  private readonly logger = new Logger(SheetsDbService.name);
  private spreadsheetId: string | null = null;
  private saKey: string | null = null;
  private bootstrappedAt: string | null = null;
  private ultimoErro: string | null = null;
  private abasExistentes = new Set<string>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    this.spreadsheetId = this.config.get<string>('SHEETS_DB_ID') ?? null;
    this.saKey = this.config.get<string>('GOOGLE_SHEETS_SA_KEY_BASE64') ?? null;
    if (!this.spreadsheetId || !this.saKey) {
      this.logger.warn(
        'Sheets-DB desabilitado (faltam SHEETS_DB_ID e/ou GOOGLE_SHEETS_SA_KEY_BASE64). Operando em-memória.',
      );
      return;
    }
    try {
      await this.bootstrap();
      this.bootstrappedAt = new Date().toISOString();
    } catch (err) {
      this.ultimoErro = (err as Error).message;
      this.logger.error(
        `Sheets-DB bootstrap falhou: ${this.ultimoErro}. Operando em modo degradado.`,
      );
    }
  }

  isEnabled(): boolean {
    return Boolean(this.spreadsheetId && this.saKey && this.bootstrappedAt);
  }

  getStatus(): SheetsDbStatus {
    return {
      enabled: this.isEnabled(),
      spreadsheetId: this.spreadsheetId,
      bootstrappedAt: this.bootstrappedAt,
      abas: Object.values(SHEETS).map((s) => ({
        nome: s.name,
        existe: this.abasExistentes.has(s.name),
      })),
      ultimoErro: this.ultimoErro,
    };
  }

  /**
   * S2.10.8a — Adapter para SourceConfig do IntegracoesService. Sheets-DB é
   * DUAL-WRITE (não tem fetch periódico), então `syncedAt` é o timestamp do
   * bootstrap inicial e `count` é o número de abas existentes confirmadas.
   * `stale=false` sempre (não há TTL — é write-through pelo dual-write).
   */
  getSyncStatusAsSource(): { syncedAt: string | null; count: number; stale: boolean } {
    return {
      syncedAt: this.bootstrappedAt,
      count: this.abasExistentes.size,
      stale: false,
    };
  }

  /**
   * S2.10.8a — Re-executa bootstrap (admin via /configuracoes/integracoes).
   * Lança ServiceUnavailable se falhar.
   */
  async forceSyncAsSource(): Promise<{ syncedAt: string; count: number }> {
    await this.bootstrap();
    this.bootstrappedAt = new Date().toISOString();
    return { syncedAt: this.bootstrappedAt, count: this.abasExistentes.size };
  }

  /**
   * Cria as 3 abas com headers se não existirem. Idempotente — em
   * rodadas subsequentes apenas confirma a presença.
   */
  async bootstrap(): Promise<void> {
    if (!this.spreadsheetId || !this.saKey) {
      throw new ServiceUnavailableException('Sheets-DB sem credenciais.');
    }
    const client = await getSheetsClient(this.saKey);
    const sumario: string[] = [];
    for (const cfg of Object.values(SHEETS)) {
      const { created } = await createSheetIfMissing(client, this.spreadsheetId, cfg.name, [
        ...cfg.headers,
      ]);
      this.abasExistentes.add(cfg.name);
      sumario.push(`${cfg.name}=${created ? 'criada' : 'OK'}`);
    }
    this.logger.log(`Sheets-DB bootstrap: ${sumario.join(', ')}`);
  }

  // ── Reads ─────────────────────────────────────────────────────

  async readEscalaMensal(): Promise<string[][]> {
    return this.readDataRows(SHEETS.ESCALA_MENSAL.name);
  }

  async readEscalaEspecial(): Promise<string[][]> {
    return this.readDataRows(SHEETS.ESCALA_ESPECIAL.name);
  }

  async readNotasServico(): Promise<string[][]> {
    return this.readDataRows(SHEETS.NOTAS_SERVICO.name);
  }

  private async readDataRows(sheetName: string): Promise<string[][]> {
    if (!this.isEnabled()) return [];
    const client = await getSheetsClient(this.saKey!);
    const all = await readAll(client, this.spreadsheetId!, sheetName);
    return all.slice(1); // descarta header
  }

  // ── Writes ────────────────────────────────────────────────────

  /**
   * Substitui TODAS as linhas de Escala Mensal de um (ano, mes) — útil
   * após re-import de XLSX. As linhas devem estar na ordem das colunas
   * declaradas em SHEETS.ESCALA_MENSAL.headers.
   *
   * Implementação: lê tudo, filtra fora as linhas do (ano, mes),
   * concatena as novas e reescreve. Custo O(N) mas N tipicamente < 5k.
   */
  async replaceEscalaMensalMes(ano: number, mes: number, novasLinhas: string[][]): Promise<void> {
    if (!this.isEnabled()) return;
    const client = await getSheetsClient(this.saKey!);
    const all = await readAll(client, this.spreadsheetId!, SHEETS.ESCALA_MENSAL.name);
    const header = all[0] ?? [...SHEETS.ESCALA_MENSAL.headers];
    const outras = all.slice(1).filter((row) => row[0] !== String(ano) || row[1] !== String(mes));
    const merged = [...outras, ...novasLinhas];
    await clearAndWrite(client, this.spreadsheetId!, SHEETS.ESCALA_MENSAL.name, merged);
    this.logger.log(
      `Sheets-DB replaceEscalaMensal ${ano}-${mes}: ${novasLinhas.length} linhas (total: ${merged.length})`,
    );
    void header;
  }

  async replaceEscalaEspecialMes(ano: number, mes: number, novasLinhas: string[][]): Promise<void> {
    if (!this.isEnabled()) return;
    const client = await getSheetsClient(this.saKey!);
    const all = await readAll(client, this.spreadsheetId!, SHEETS.ESCALA_ESPECIAL.name);
    const outras = all.slice(1).filter((row) => row[0] !== String(ano) || row[1] !== String(mes));
    const merged = [...outras, ...novasLinhas];
    await clearAndWrite(client, this.spreadsheetId!, SHEETS.ESCALA_ESPECIAL.name, merged);
    this.logger.log(
      `Sheets-DB replaceEscalaEspecial ${ano}-${mes}: ${novasLinhas.length} linhas (total: ${merged.length})`,
    );
  }

  /**
   * Upsert de uma única NS pelo `id` (col 0). Mantém as outras NS intactas.
   */
  async upsertNotaServico(linha: string[]): Promise<void> {
    if (!this.isEnabled()) return;
    const client = await getSheetsClient(this.saKey!);
    await upsertByKey(
      client,
      this.spreadsheetId!,
      SHEETS.NOTAS_SERVICO.name,
      SHEETS.NOTAS_SERVICO.keyColIdx,
      [linha],
    );
  }

  /**
   * Remove uma NS pelo id. No-op se não enabled.
   */
  async deleteNotaServico(id: string): Promise<void> {
    if (!this.isEnabled()) return;
    const client = await getSheetsClient(this.saKey!);
    const all = await readAll(client, this.spreadsheetId!, SHEETS.NOTAS_SERVICO.name);
    const filtered = all.slice(1).filter((row) => row[0] !== id);
    await clearAndWrite(client, this.spreadsheetId!, SHEETS.NOTAS_SERVICO.name, filtered);
  }
}
