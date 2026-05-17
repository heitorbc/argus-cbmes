import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { CreateUnidadeInput, Unidade, UpdateUnidadeInput } from '@argus/shared-types';
import type { Unidade as PrismaUnidade } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Slug fixo da única unidade da Fase 1 (1ª Cia / 1º BBM). */
export const UNIDADE_1CIA_1BBM_ID = 'unid:1cia-1bbm';

/** Código institucional da 1ª Cia/1º BBM — usado pelo seed e busca. */
export const UNIDADE_1CIA_1BBM_CODIGO = '1ª1º';

/**
 * Cadastro de Unidades institucionais — fonte de verdade em Postgres (S2.10.3).
 *
 * Fase 1: 1ª1º é a única ativa, garantida pelo `ensure1aCia()` no boot.
 * CRUD admin via `/unidades` para criar outras (2ª Cia, futuras OBMs).
 */
@Injectable()
export class UnidadesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensure1aCia();
  }

  async list(): Promise<Unidade[]> {
    const rows = await this.prisma.unidade.findMany({ orderBy: { codigo: 'asc' } });
    return rows.map(toUnidade);
  }

  async findById(id: string): Promise<Unidade> {
    const u = await this.prisma.unidade.findUnique({ where: { id } });
    if (!u) throw new NotFoundException(`Unidade ${id} não encontrada`);
    return toUnidade(u);
  }

  async findByCodigo(codigo: string): Promise<Unidade | undefined> {
    const u = await this.prisma.unidade.findUnique({ where: { codigo } });
    return u ? toUnidade(u) : undefined;
  }

  async create(input: CreateUnidadeInput): Promise<Unidade> {
    const existing = await this.prisma.unidade.findUnique({ where: { codigo: input.codigo } });
    if (existing) {
      throw new ConflictException(`Unidade com código "${input.codigo}" já existe`);
    }
    const u = await this.prisma.unidade.create({
      data: { codigo: input.codigo, nome: input.nome, ativo: input.ativo ?? true },
    });
    return toUnidade(u);
  }

  async update(id: string, input: UpdateUnidadeInput): Promise<Unidade> {
    const current = await this.prisma.unidade.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Unidade ${id} não encontrada`);
    if (input.codigo && input.codigo !== current.codigo) {
      const conflict = await this.prisma.unidade.findUnique({ where: { codigo: input.codigo } });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`Unidade com código "${input.codigo}" já existe`);
      }
    }
    const u = await this.prisma.unidade.update({
      where: { id },
      data: {
        codigo: input.codigo ?? current.codigo,
        nome: input.nome ?? current.nome,
        ativo: input.ativo ?? current.ativo,
      },
    });
    return toUnidade(u);
  }

  /** Soft delete via `ativo=false` (preserva relações com Recursos). */
  async softDelete(id: string): Promise<Unidade> {
    return this.update(id, { ativo: false });
  }

  /**
   * Garante que a 1ª Cia/1º BBM exista no banco — idempotente.
   * Tolerante a banco indisponível (warning log + continua); evita crash
   * do backend caso o Postgres esteja temporariamente fora.
   */
  private async ensure1aCia(): Promise<void> {
    try {
      await this.prisma.unidade.upsert({
        where: { codigo: UNIDADE_1CIA_1BBM_CODIGO },
        update: {},
        create: {
          id: UNIDADE_1CIA_1BBM_ID,
          codigo: UNIDADE_1CIA_1BBM_CODIGO,
          nome: '1ª Cia / 1º BBM',
          ativo: true,
        },
      });
    } catch {
      // Banco indisponível no boot — boot prossegue; próxima requisição retenta.
    }
  }
}

function toUnidade(u: PrismaUnidade): Unidade {
  return {
    id: u.id,
    codigo: u.codigo,
    nome: u.nome,
    ativo: u.ativo,
    criadoEm: u.criadoEm.toISOString(),
    atualizadoEm: u.atualizadoEm.toISOString(),
  };
}
