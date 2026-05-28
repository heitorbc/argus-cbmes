import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EscalaEspecialMensal } from '@argus/shared-types';
import type {
  EscalaEspecialAto as PrismaEscalaEspecialAto,
  EscalaEspecialMensal as PrismaEscalaEspecialMensal,
} from '@prisma/client';
import { resolveDataDir } from '../../common/dev-fixtures';
import { PrismaService } from '../../common/prisma/prisma.service';
import { parseEscalaEspecialXlsm, parseFilenameEspecial } from './escala-especial-xlsm-parser';

/**
 * S2.10.5 — Persistência em Postgres via Prisma (fonte canônica desde S2.10.9d).
 * S2.10.14a — Removido fallback bootstrap via Sheets-DB; Postgres é a única fonte.
 */
@Injectable()
export class EscalasEspeciaisService implements OnModuleInit {
  private readonly logger = new Logger(EscalasEspeciaisService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (process.env.NODE_ENV !== 'production') {
      const total = await this.countMeses();
      if (total === 0) await this.bootstrapFromFilesystem();
    }
  }

  /**
   * Dev-only — lê o XLSM mais recente em `data/Escala Especial Tabela de Lançamento/`.
   * Só roda se Postgres E Sheets-DB estiverem vazios.
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
        await this.upsertNoPostgres(escala);
        this.logger.log(
          `Bootstrap escala especial: ${f} (${String(escala.mes).padStart(2, '0')}/${escala.ano}, ${escala.atos.length} atos)`,
        );
      } catch (err) {
        this.logger.error(
          `Bootstrap escala especial falhou para "${f}": ${(err as Error).message}`,
        );
      }
    }
  }

  async list(): Promise<{
    escalas: {
      ano: number;
      mes: number;
      origemArquivo: string;
      importadoEm: string;
      totalAtos: number;
    }[];
  }> {
    const rows = await this.prisma.escalaEspecialMensal.findMany({
      orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
      include: { _count: { select: { atos: true } } },
    });
    return {
      escalas: rows.map((r) => ({
        ano: r.ano,
        mes: r.mes,
        origemArquivo: r.origemArquivo,
        importadoEm: r.importadoEm.toISOString(),
        totalAtos: r._count.atos,
      })),
    };
  }

  async get(ano: number, mes: number): Promise<EscalaEspecialMensal | null> {
    const row = await this.prisma.escalaEspecialMensal.findUnique({
      where: { ano_mes: { ano, mes } },
      include: { atos: true },
    });
    if (!row) return null;
    return toEscalaEspecial(row);
  }

  /**
   * S2.2 → S2.10.9d — Persiste em Postgres (transação cascata). Sheets-DB
   * dual-write removido em S2.10.9d (espelho legado não é mais necessário;
   * Postgres é a fonte de verdade canônica desde S2.10.5).
   */
  async save(escala: EscalaEspecialMensal): Promise<EscalaEspecialMensal> {
    await this.upsertNoPostgres(escala);
    return (await this.get(escala.ano, escala.mes)) ?? escala;
  }

  async delete(ano: number, mes: number): Promise<boolean> {
    const existing = await this.prisma.escalaEspecialMensal.findUnique({
      where: { ano_mes: { ano, mes } },
    });
    if (!existing) return false;
    await this.prisma.escalaEspecialMensal.delete({
      where: { ano_mes: { ano, mes } },
    });
    return true;
  }

  /** Atos especiais que ocorrem em uma data específica. Útil para Prévia (S6b). */
  async getAtosDoDia(
    ano: number,
    mes: number,
    dataIso: string,
  ): Promise<EscalaEspecialMensal['atos']> {
    const rows = await this.prisma.escalaEspecialAto.findMany({
      where: { data: dataIso, escalaEspecial: { ano, mes } },
    });
    return rows.map((a) => ({
      data: a.data,
      militarRaw: a.militarRaw,
      militarNf: a.militarNf ?? undefined,
      horario: a.horario,
      funcao: a.funcao,
    }));
  }

  // ── helpers privados ──────────────────────────────────────────────

  private async countMeses(): Promise<number> {
    try {
      return await this.prisma.escalaEspecialMensal.count();
    } catch {
      return 0;
    }
  }

  /**
   * Upsert por (ano, mes) com cascata de atos: deleta atos antigos e
   * recria. Re-import substitui mês inteiro (ADR-014 D4).
   */
  private async upsertNoPostgres(escala: EscalaEspecialMensal): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.escalaEspecialMensal.findUnique({
        where: { ano_mes: { ano: escala.ano, mes: escala.mes } },
      });
      if (existing) {
        await tx.escalaEspecialAto.deleteMany({
          where: { escalaEspecialId: existing.id },
        });
        await tx.escalaEspecialMensal.update({
          where: { id: existing.id },
          data: {
            origemArquivo: escala.origemArquivo,
            importadoEm: new Date(escala.importadoEm),
            importadoPorNf: escala.importadoPorNf ?? null,
            avisos: escala.avisos as unknown as object,
            atos: { create: escala.atos.map(toAtoCreate) },
          },
        });
      } else {
        await tx.escalaEspecialMensal.create({
          data: {
            ano: escala.ano,
            mes: escala.mes,
            origemArquivo: escala.origemArquivo,
            importadoEm: new Date(escala.importadoEm),
            importadoPorNf: escala.importadoPorNf ?? null,
            avisos: escala.avisos as unknown as object,
            atos: { create: escala.atos.map(toAtoCreate) },
          },
        });
      }
    });
  }
}

function toAtoCreate(a: EscalaEspecialMensal['atos'][number]) {
  return {
    data: a.data,
    militarRaw: a.militarRaw,
    militarNf: a.militarNf ?? null,
    horario: a.horario,
    funcao: a.funcao,
  };
}

function toEscalaEspecial(
  row: PrismaEscalaEspecialMensal & { atos: PrismaEscalaEspecialAto[] },
): EscalaEspecialMensal {
  return {
    ano: row.ano,
    mes: row.mes,
    origemArquivo: row.origemArquivo,
    importadoEm: row.importadoEm.toISOString(),
    importadoPorNf: row.importadoPorNf ?? undefined,
    atos: row.atos.map((a) => ({
      data: a.data,
      militarRaw: a.militarRaw,
      militarNf: a.militarNf ?? undefined,
      horario: a.horario,
      funcao: a.funcao,
    })),
    avisos: (row.avisos as unknown as string[]) ?? [],
  };
}
