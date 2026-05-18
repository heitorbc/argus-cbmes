import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ConferenciaCov,
  RegistrarConferenciaCovInput,
  ChecklistCovItem,
} from '@argus/shared-types';
import type { ConferenciaCov as PrismaConferenciaCov } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * S2.10.6 — Persistência da Conferência do COV/Motorista.
 *
 * Aceite do Termo de Responsabilidade + checklist de 25 itens.
 * Unique por (data, vtrPrefixo, motoristaNf) — 1 conferência por turno.
 */
@Injectable()
export class ConferenciaCovService {
  constructor(private readonly prisma: PrismaService) {}

  async getByVtrEData(data: string, vtrPrefixo: string): Promise<ConferenciaCov | null> {
    const row = await this.prisma.conferenciaCov.findFirst({
      where: { data, vtrPrefixo },
      orderBy: { atualizadoEm: 'desc' },
    });
    return row ? toConferenciaCov(row) : null;
  }

  async registrar(
    data: string,
    vtrPrefixo: string,
    motoristaNf: string,
    input: RegistrarConferenciaCovInput,
  ): Promise<ConferenciaCov> {
    const row = await this.prisma.conferenciaCov.upsert({
      where: {
        data_vtrPrefixo_motoristaNf: { data, vtrPrefixo, motoristaNf },
      },
      create: {
        data,
        vtrPrefixo,
        motoristaNf,
        termoAceitoEm: new Date(input.termoAceitoEm),
        checklist: input.itens as unknown as object,
        observacao: input.observacao ?? null,
      },
      update: {
        termoAceitoEm: new Date(input.termoAceitoEm),
        checklist: input.itens as unknown as object,
        observacao: input.observacao ?? null,
      },
    });
    return toConferenciaCov(row);
  }

  async listDoDia(data: string): Promise<ConferenciaCov[]> {
    const rows = await this.prisma.conferenciaCov.findMany({
      where: { data },
      orderBy: { vtrPrefixo: 'asc' },
    });
    return rows.map(toConferenciaCov);
  }

  /** Conta itens NOK da última conferência de uma viatura na data. */
  async contarItensNok(data: string, vtrPrefixo: string): Promise<number> {
    const conf = await this.getByVtrEData(data, vtrPrefixo);
    if (!conf) return 0;
    return conf.itens.filter((i) => !i.ok).length;
  }

  /** Garante que existe — usado pelo gating do botão MF CIODES (futuro S2.10.7). */
  async ensureExistsOrThrow(data: string, vtrPrefixo: string): Promise<void> {
    const conf = await this.getByVtrEData(data, vtrPrefixo);
    if (!conf) {
      throw new NotFoundException(
        `Conferência do COV para ${vtrPrefixo} em ${data} ainda não foi realizada.`,
      );
    }
  }
}

function toConferenciaCov(r: PrismaConferenciaCov): ConferenciaCov {
  return {
    id: r.id,
    data: r.data,
    vtrPrefixo: r.vtrPrefixo,
    motoristaNf: r.motoristaNf,
    termoAceitoEm: r.termoAceitoEm.toISOString(),
    itens: (r.checklist as unknown as ChecklistCovItem[]) ?? [],
    observacao: r.observacao ?? undefined,
    criadoEm: r.criadoEm.toISOString(),
    atualizadoEm: r.atualizadoEm.toISOString(),
  };
}
