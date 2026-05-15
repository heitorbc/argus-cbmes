import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EscalaEspecialMensal } from '@argus/shared-types';
import { resolveDataDir } from '../../common/dev-fixtures';
import {
  parseEscalaEspecialXlsm,
  parseFilenameEspecial,
} from './escala-especial-xlsm-parser';

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

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') return;
    if (this.byMes.size > 0) return;
    await this.bootstrapFromFilesystem();
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

  save(escala: EscalaEspecialMensal): EscalaEspecialMensal {
    this.byMes.set(key(escala), escala);
    return escala;
  }

  delete(ano: number, mes: number): boolean {
    return this.byMes.delete(key({ ano, mes }));
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
