import { Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EscalaEspecialMensal } from '@argus/shared-types';
import { resolveDataDir } from '../../common/dev-fixtures';
import {
  parseEscalaEspecialXlsm,
  parseFilenameEspecial,
} from './escala-especial-xlsm-parser';
import { SheetsDbService } from '../sheets-db/sheets-db.service';
import {
  escalaEspecialToRows,
  rowsToEscalasEspeciais,
} from '../sheets-db/sheets-db-serializers';

interface EscalaKey {
  ano: number;
  mes: number;
}

function key(k: EscalaKey): string {
  return `${k.ano}-${String(k.mes).padStart(2, '0')}`;
}

/**
 * Mock service in-memory para Escalas Especiais (S6a).
 * Padrão idêntico a `EscalasService` (escala mensal). Em S5b migra para Prisma.
 */
@Injectable()
export class EscalasEspeciaisService implements OnModuleInit {
  private readonly logger = new Logger(EscalasEspeciaisService.name);
  private readonly byMes = new Map<string, EscalaEspecialMensal>();

  constructor(@Optional() private readonly sheetsDb?: SheetsDbService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (this.byMes.size > 0) return;
    // S2.8.2 — Sheets-DB é fonte primária; XLSM é fallback dev.
    await this.bootstrapFromSheetsDb();
    if (this.byMes.size === 0 && process.env.NODE_ENV !== 'production') {
      await this.bootstrapFromFilesystem();
    }
  }

  private async bootstrapFromSheetsDb(): Promise<void> {
    if (!this.sheetsDb?.isEnabled()) {
      this.logger.log(
        'Bootstrap escala especial: Sheets-DB desabilitado, tentando XLSM local.',
      );
      return;
    }
    try {
      const rows = await this.sheetsDb.readEscalaEspecial();
      const escalas = rowsToEscalasEspeciais(rows);
      for (const [k, escala] of escalas.entries()) {
        this.byMes.set(k, escala);
      }
      this.logger.log(
        `Bootstrap escala especial: ${escalas.size} meses carregados do Sheets-DB (${rows.length} linhas).`,
      );
    } catch (err) {
      this.logger.warn(
        `Bootstrap escala especial Sheets-DB falhou: ${(err as Error).message}. Tentando XLSM local.`,
      );
    }
  }

  /**
   * Dev-only — ao iniciar, se o cache está vazio, lê o XLSM mais recente em
   * `data/Escala Especial Tabela de Lançamento/` e popula. Idempotente.
   */
  private async bootstrapFromFilesystem(): Promise<void> {
    const dataDir = resolveDataDir('Escala Especial Tabela de Lançamento');
    if (!dataDir) {
      this.logger.warn(
        'Bootstrap escala especial: pasta "data/Escala Especial Tabela de Lançamento/" não encontrada — pulando.',
      );
      return;
    }
    const xlsmFiles = readdirSync(dataDir)
      .filter((f) => f.toLowerCase().endsWith('.xlsm') && !f.startsWith('~$'))
      .filter((f) => {
        try {
          parseFilenameEspecial(f);
          return true;
        } catch {
          return false;
        }
      })
      .map((f) => {
        const { mes, ano } = parseFilenameEspecial(f);
        return { f, mes, ano };
      })
      .sort((a, b) => b.ano - a.ano || b.mes - a.mes)
      .slice(0, 1);

    for (const { f } of xlsmFiles) {
      const buffer = readFileSync(join(dataDir, f));
      try {
        const { escala } = await parseEscalaEspecialXlsm({ buffer, filename: f });
        this.byMes.set(key(escala), escala);
        this.logger.log(
          `Bootstrap escala especial: ${f} (${String(escala.mes).padStart(2, '0')}/${escala.ano}, ${escala.atos.length} atos)`,
        );
      } catch (err) {
        this.logger.error(`Bootstrap escala especial falhou para "${f}": ${(err as Error).message}`);
      }
    }
  }

  list(): {
    escalas: {
      ano: number;
      mes: number;
      origemArquivo: string;
      importadoEm: string;
      totalAtos: number;
    }[];
  } {
    const escalas = [...this.byMes.values()]
      .map((e) => ({
        ano: e.ano,
        mes: e.mes,
        origemArquivo: e.origemArquivo,
        importadoEm: e.importadoEm,
        totalAtos: e.atos.length,
      }))
      .sort((a, b) => b.ano - a.ano || b.mes - a.mes);
    return { escalas };
  }

  get(ano: number, mes: number): EscalaEspecialMensal | null {
    return this.byMes.get(key({ ano, mes })) ?? null;
  }

  /**
   * S2.2 — dual-write: persiste in-memory e dispara replace no Sheets-DB
   * em background. Falhas Sheets logam warning mas não derrubam.
   */
  save(escala: EscalaEspecialMensal): EscalaEspecialMensal {
    this.byMes.set(key(escala), escala);
    this.syncToSheetsDb(escala);
    return escala;
  }

  delete(ano: number, mes: number): boolean {
    const removed = this.byMes.delete(key({ ano, mes }));
    if (removed) this.deleteFromSheetsDb(ano, mes);
    return removed;
  }

  private syncToSheetsDb(escala: EscalaEspecialMensal): void {
    if (!this.sheetsDb?.isEnabled()) return;
    const rows = escalaEspecialToRows(escala);
    void this.sheetsDb
      .replaceEscalaEspecialMes(escala.ano, escala.mes, rows)
      .catch((err) => {
        this.logger.warn(
          `Sheets-DB write falhou para escala especial ${escala.mes}/${escala.ano}: ${(err as Error).message}.`,
        );
      });
  }

  private deleteFromSheetsDb(ano: number, mes: number): void {
    if (!this.sheetsDb?.isEnabled()) return;
    void this.sheetsDb.replaceEscalaEspecialMes(ano, mes, []).catch((err) => {
      this.logger.warn(
        `Sheets-DB delete falhou para escala especial ${mes}/${ano}: ${(err as Error).message}.`,
      );
    });
  }

  /** Atos especiais que ocorrem em uma data específica. Útil para Prévia (S6b). */
  getAtosDoDia(ano: number, mes: number, dataIso: string): EscalaEspecialMensal['atos'] {
    const escala = this.get(ano, mes);
    if (!escala) return [];
    return escala.atos.filter((a) => a.data === dataIso);
  }

  /** Reset usado nos tests. */
  reset(): void {
    this.byMes.clear();
  }
}
