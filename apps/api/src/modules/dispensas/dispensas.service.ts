import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  calcularSaldoMilitar,
  dispensaAtivaNoDia,
  ORIGEM_DISPENSA,
  type CreateDispensaInput,
  type Dispensa,
  type DispensaSaldoMilitar,
  type OrigemDispensa,
  type TipoDispensa,
  type UpdateDispensaInput,
} from '@argus/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Dispensa as PrismaDispensa } from '@prisma/client';

/**
 * S6j/S2.10.7d — CRUD de Dispensas em Prisma. Sync com a planilha externa
 * "Dispensas 2026" é responsabilidade exclusiva do `SyncOrchestratorService`
 * (cron 00/06/12/18h + startup) e do botão "Sincronizar agora" no menu
 * `/configuracoes/integracoes`.
 *
 * S2.10.9b — GETs são **Postgres-puros**: removido `syncIfStale()` fire-and-
 * forget dos getters para eliminar contenção Google×Postgres no caminho do
 * request. Lag máximo aceito: 6h entre crons (Tech Lead 2026-05-20).
 */
@Injectable()
export class DispensasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: { militarNf?: string; ano?: number } = {}): Promise<Dispensa[]> {
    const where: Record<string, unknown> = { deletedAt: null };
    if (filter.militarNf) where.militarNf = filter.militarNf;
    if (filter.ano !== undefined) {
      where.dataInicio = {
        gte: `${filter.ano}-01-01`,
        lte: `${filter.ano}-12-31`,
      };
    }
    const rows = await this.prisma.dispensa.findMany({
      where,
      orderBy: [{ dataInicio: 'desc' }, { criadoEm: 'desc' }],
    });
    return rows.map(toDispensa);
  }

  async findById(id: string): Promise<Dispensa> {
    const row = await this.prisma.dispensa.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundException(`Dispensa ${id} não encontrada`);
    return toDispensa(row);
  }

  /** Lista dispensas ativas em um dia específico (S6j integração Prévia). */
  async listAtivasNoDia(dataIso: string): Promise<Dispensa[]> {
    // Filtra dispensas onde dataIso ∈ [dataInicio, dataInicio + dias).
    // Postgres não tem aritmética de data em string fácil, então pegamos
    // todas as não-deletadas com dataInicio <= dataIso e filtramos em JS.
    const candidatas = await this.prisma.dispensa.findMany({
      where: { deletedAt: null, dataInicio: { lte: dataIso } },
    });
    return candidatas
      .map(toDispensa)
      .filter((d) => dispensaAtivaNoDia(d, dataIso))
      .sort((a, b) => a.militarNf.localeCompare(b.militarNf));
  }

  async create(input: CreateDispensaInput, criadoPorNf: string): Promise<Dispensa> {
    const row = await this.prisma.dispensa.create({
      data: {
        militarNf: input.militarNf,
        tipo: input.tipo,
        dataInicio: input.dataInicio,
        dias: input.dias,
        numeroEdocs: input.numeroEdocs?.trim() || null,
        observacoes: input.observacoes?.trim() || null,
        minuta: input.minuta?.trim() || null,
        equipe: input.equipe?.trim() || null,
        origem: 'manual',
        criadoPorNf,
      },
    });
    return toDispensa(row);
  }

  async update(id: string, input: UpdateDispensaInput): Promise<Dispensa> {
    const current = await this.findById(id);
    const row = await this.prisma.dispensa.update({
      where: { id },
      data: {
        tipo: input.tipo ?? current.tipo,
        dataInicio: input.dataInicio ?? current.dataInicio,
        dias: input.dias ?? current.dias,
        numeroEdocs: input.numeroEdocs?.trim() ?? current.numeroEdocs ?? null,
        observacoes: input.observacoes?.trim() ?? current.observacoes ?? null,
        minuta: input.minuta?.trim() ?? current.minuta ?? null,
        equipe: input.equipe?.trim() ?? current.equipe ?? null,
      },
    });
    return toDispensa(row);
  }

  async remove(id: string): Promise<void> {
    const found = await this.prisma.dispensa.findFirst({ where: { id, deletedAt: null } });
    if (!found) throw new NotFoundException(`Dispensa ${id} não encontrada`);
    await this.prisma.dispensa.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Saldo anual do militar (gozado, limite, restante por tipo). */
  async saldoMilitar(militarNf: string, ano: number): Promise<DispensaSaldoMilitar> {
    const dispensas = await this.list({ militarNf });
    return calcularSaldoMilitar(dispensas, militarNf, ano);
  }

  /** Atalho: total de dias gozados no ano por todos os tipos. */
  async totalDiasGozadosNoAno(militarNf: string, ano: number): Promise<number> {
    const saldo = await this.saldoMilitar(militarNf, ano);
    return saldo.totalGozado;
  }

  /**
   * S6j — usado pela criação via ajuste pré-turno: previne duplicata exata
   * de (militar+tipo+dataInicio). Retorna a dispensa existente se já houver.
   */
  async findByMilitarTipoDataInicio(
    militarNf: string,
    tipo: string,
    dataInicio: string,
  ): Promise<Dispensa | undefined> {
    const row = await this.prisma.dispensa.findFirst({
      where: { militarNf, tipo, dataInicio, deletedAt: null },
    });
    return row ? toDispensa(row) : undefined;
  }

  async createOrConflict(input: CreateDispensaInput, criadoPorNf: string): Promise<Dispensa> {
    const existing = await this.findByMilitarTipoDataInicio(
      input.militarNf,
      input.tipo,
      input.dataInicio,
    );
    if (existing) {
      throw new ConflictException(
        `Já existe dispensa do tipo ${input.tipo} para NF ${input.militarNf} iniciando em ${input.dataInicio}`,
      );
    }
    return this.create(input, criadoPorNf);
  }
}

/** Conversão PrismaDispensa → shared-types Dispensa. */
function toDispensa(row: PrismaDispensa): Dispensa {
  const origem: OrigemDispensa = ORIGEM_DISPENSA.includes(row.origem as OrigemDispensa)
    ? (row.origem as OrigemDispensa)
    : 'manual';
  return {
    id: row.id,
    militarNf: row.militarNf,
    tipo: row.tipo as TipoDispensa,
    dataInicio: row.dataInicio,
    dias: row.dias,
    numeroEdocs: row.numeroEdocs ?? undefined,
    observacoes: row.observacoes ?? undefined,
    minuta: row.minuta ?? undefined,
    equipe: row.equipe ?? undefined,
    origem,
    criadoEm: row.criadoEm.toISOString(),
    // S2.10.7d — criadoPorNf agora é nullable (sync sem User). Mapeia null → 'SYNC'.
    criadoPorNf: row.criadoPorNf ?? 'SYNC',
  };
}
