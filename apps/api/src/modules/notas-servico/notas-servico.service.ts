import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  CreateNotaServicoInput,
  NotaServico,
  UpdateNotaServicoInput,
} from '@argus/shared-types';
import type { NotaServico as PrismaNS } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SheetsDbService } from '../sheets-db/sheets-db.service';
import { rowToNotaServico } from '../sheets-db/sheets-db-serializers';

/**
 * S6l — CRUD de Notas de Serviço.
 *
 * S2.10.5 — Prisma é fonte primária. Sheets-DB continua como espelho
 * institucional (dual-write fire-and-forget). Bootstrap one-shot lê
 * Sheets-DB e popula Postgres se a tabela estiver vazia (transição).
 *
 * Soft delete via `deletedAt` (ADR-014 D4): preserva auditoria histórica
 * de quem criou/removeu uma NS.
 */
@Injectable()
export class NotasServicoService implements OnModuleInit {
  private readonly logger = new Logger(NotasServicoService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly sheetsDb?: SheetsDbService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    await this.bootstrapFromSheetsDbIfEmpty();
  }

  /**
   * Bootstrap one-shot: se a tabela Postgres está vazia E o Sheets-DB tem
   * dados, importa. Idempotente — só roda na 1ª execução após a migração.
   * Após isso, Postgres é fonte e Sheets-DB recebe write-only.
   */
  private async bootstrapFromSheetsDbIfEmpty(): Promise<void> {
    try {
      const count = await this.prisma.notaServico.count({ where: { deletedAt: null } });
      if (count > 0) return;
      if (!this.sheetsDb?.isEnabled()) return;
      const rows = await this.sheetsDb.readNotasServico();
      let imported = 0;
      for (const row of rows) {
        const ns = rowToNotaServico(row);
        if (!ns) continue;
        await this.prisma.notaServico
          .create({
            data: {
              id: ns.id,
              codigo: ns.codigo,
              descricao: ns.descricao,
              data: ns.data,
              horaInicio: ns.horaInicio,
              horaFim: ns.horaFim,
              viaturaPrefixo: ns.viaturaPrefixo,
              militaresNfs: ns.militaresNfs,
              observacoes: ns.observacoes,
              criadoEm: new Date(ns.criadoEm),
              criadoPorNf: ns.criadoPorNf,
            },
          })
          .then(() => {
            imported++;
          })
          .catch((err: Error) => {
            this.logger.warn(`Bootstrap NS skip ${ns.id}: ${err.message}`);
          });
      }
      if (imported > 0) {
        this.logger.log(`Bootstrap NS: ${imported} entradas importadas do Sheets-DB → Postgres.`);
      }
    } catch (err) {
      this.logger.warn(`Bootstrap NS falhou: ${(err as Error).message}.`);
    }
  }

  async list(filter: { data?: string; militarNf?: string } = {}): Promise<NotaServico[]> {
    const rows = await this.prisma.notaServico.findMany({
      where: {
        deletedAt: null,
        ...(filter.data ? { data: filter.data } : {}),
        ...(filter.militarNf ? { militaresNfs: { has: filter.militarNf } } : {}),
      },
      orderBy: [{ data: 'desc' }, { horaInicio: 'asc' }],
    });
    return rows.map(toNotaServico);
  }

  async findById(id: string): Promise<NotaServico> {
    const row = await this.prisma.notaServico.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException(`Nota de Serviço ${id} não encontrada`);
    return toNotaServico(row);
  }

  async listDoDia(dataIso: string): Promise<NotaServico[]> {
    return this.list({ data: dataIso });
  }

  async create(input: CreateNotaServicoInput, criadoPorNf: string): Promise<NotaServico> {
    const row = await this.prisma.notaServico.create({
      data: {
        codigo: input.codigo.trim(),
        descricao: input.descricao.trim(),
        data: input.data,
        horaInicio: input.horaInicio,
        horaFim: input.horaFim,
        viaturaPrefixo: input.viaturaPrefixo?.trim() || null,
        militaresNfs: input.militaresNfs,
        observacoes: input.observacoes?.trim() || null,
        criadoPorNf,
      },
    });
    return toNotaServico(row);
  }

  /** Rejeita duplicata exata `(codigo, data)`. */
  async createOrConflict(input: CreateNotaServicoInput, criadoPorNf: string): Promise<NotaServico> {
    const existing = await this.prisma.notaServico.findFirst({
      where: { data: input.data, codigo: input.codigo.trim(), deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`Já existe NS "${input.codigo}" para a data ${input.data}`);
    }
    return this.create(input, criadoPorNf);
  }

  async update(id: string, input: UpdateNotaServicoInput): Promise<NotaServico> {
    // Garante que existe + não está soft-deleted.
    await this.findById(id);
    const data: Partial<PrismaNS> = {};
    if (input.codigo !== undefined) data.codigo = input.codigo.trim();
    if (input.descricao !== undefined) data.descricao = input.descricao.trim();
    if (input.data !== undefined) data.data = input.data;
    if (input.horaInicio !== undefined) data.horaInicio = input.horaInicio;
    if (input.horaFim !== undefined) data.horaFim = input.horaFim;
    if (input.viaturaPrefixo !== undefined)
      data.viaturaPrefixo = input.viaturaPrefixo.trim() || null;
    if (input.militaresNfs !== undefined) data.militaresNfs = input.militaresNfs;
    if (input.observacoes !== undefined) data.observacoes = input.observacoes.trim() || null;
    const row = await this.prisma.notaServico.update({ where: { id }, data });
    return toNotaServico(row);
  }

  async remove(id: string): Promise<void> {
    // S2.10.9d — Sheets-DB dual-write removido. Postgres é canônico desde S2.10.5.
    const row = await this.prisma.notaServico.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException(`Nota de Serviço ${id} não encontrada`);
    await this.prisma.notaServico.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}

function toNotaServico(r: PrismaNS): NotaServico {
  return {
    id: r.id,
    codigo: r.codigo,
    descricao: r.descricao,
    data: r.data,
    horaInicio: r.horaInicio,
    horaFim: r.horaFim,
    viaturaPrefixo: r.viaturaPrefixo ?? undefined,
    militaresNfs: r.militaresNfs,
    observacoes: r.observacoes ?? undefined,
    criadoEm: r.criadoEm.toISOString(),
    criadoPorNf: r.criadoPorNf,
  };
}
