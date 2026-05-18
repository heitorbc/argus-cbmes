import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  CompartimentoMaterial,
  ConferenciaMaterialV2,
  CreateCompartimentoMaterialInput,
  ItemConferenciaMaterialV2,
  RegistrarConferenciaMaterialInput,
  UpdateCompartimentoMaterialInput,
} from '@argus/shared-types';
import type {
  CompartimentoMaterial as PrismaCompartimento,
  ConferenciaMaterial as PrismaConferenciaMaterial,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * S2.10.6 — Conferência de Materiais (separada da Conferência da Viatura).
 *
 * 2 entidades:
 * - `CompartimentoMaterial`: cadastro admin de compartimentos + materiais
 *   esperados, por contexto (viatura ou local).
 * - `ConferenciaMaterial`: registro do que foi conferido em uma data.
 *
 * Bootstrap dev cria 8 compartimentos default (5 viaturas + 3 locais)
 * para acelerar setup local. Em prod, admin cria via CRUD.
 */
const DEFAULT_COMPARTIMENTOS: Array<{
  contexto: string;
  contextoLabel: string;
  compartimento: string;
  materiais: string[];
}> = [
  // Viaturas
  {
    contexto: 'viatura:ABTS_011',
    contextoLabel: 'ABTS 011',
    compartimento: 'Box principal',
    materiais: ['Mangueira de 38mm', 'Esguicho regulável', 'Chave Storz', 'Adaptador 25/38'],
  },
  {
    contexto: 'viatura:AR_044',
    contextoLabel: 'AR 044 (Resgate)',
    compartimento: 'Compartimento APH',
    materiais: ['Maca rígida', 'Colar cervical (G/M/P)', 'Tala moldável', 'KED'],
  },
  {
    contexto: 'viatura:ATB_001',
    contextoLabel: 'ATB 001',
    compartimento: 'Box materiais',
    materiais: ['Cordas de salvamento', 'Mosquetões', 'Cadeira de rapel'],
  },
  {
    contexto: 'viatura:AU_154',
    contextoLabel: 'AU 154 (Chefe Operações)',
    compartimento: 'Porta-mala',
    materiais: ['Rádio portátil', 'Capacete operacional', 'Coete refletivo'],
  },
  {
    contexto: 'viatura:TE_110',
    contextoLabel: 'TE 110 (Plataforma)',
    compartimento: 'Caixa de ferramentas',
    materiais: ['Macaco hidráulico', 'Estabilizadores', 'Cabos de aço'],
  },
  // Locais
  {
    contexto: 'local:SALA_FISCAL',
    contextoLabel: 'Sala do Fiscal',
    compartimento: 'Estante',
    materiais: ['Caderno de Parte Diária', 'Carimbo do Fiscal', 'Chaves reserva'],
  },
  {
    contexto: 'local:ALMOXARIFADO_OPERACIONAL',
    contextoLabel: 'Almoxarifado Operacional',
    compartimento: 'Prateleira A',
    materiais: ['Mangueiras reserva', 'EPI completo (G/M/P)', 'Lanternas'],
  },
  {
    contexto: 'local:GUARITA_QCG',
    contextoLabel: 'Guarita QCG',
    compartimento: 'Armário',
    materiais: ['Livro de ocorrências', 'Chaves do quartel', 'Lanterna'],
  },
];

@Injectable()
export class CompartimentosMateriaisService implements OnModuleInit {
  private readonly logger = new Logger(CompartimentosMateriaisService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') return;
    try {
      const count = await this.prisma.compartimentoMaterial.count();
      if (count > 0) return;
      for (const [i, c] of DEFAULT_COMPARTIMENTOS.entries()) {
        await this.prisma.compartimentoMaterial.create({
          data: {
            contexto: c.contexto,
            contextoLabel: c.contextoLabel,
            compartimento: c.compartimento,
            materiais: c.materiais as unknown as object,
            ordem: i,
            ativo: true,
          },
        });
      }
      this.logger.log(`Compartimentos: ${DEFAULT_COMPARTIMENTOS.length} defaults dev carregados.`);
    } catch (err) {
      this.logger.warn(`Bootstrap compartimentos falhou: ${(err as Error).message}.`);
    }
  }

  async list(contexto?: string): Promise<CompartimentoMaterial[]> {
    const rows = await this.prisma.compartimentoMaterial.findMany({
      where: contexto ? { contexto } : undefined,
      orderBy: [{ contexto: 'asc' }, { ordem: 'asc' }],
    });
    return rows.map(toCompartimento);
  }

  async findById(id: string): Promise<CompartimentoMaterial> {
    const row = await this.prisma.compartimentoMaterial.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Compartimento ${id} não encontrado`);
    return toCompartimento(row);
  }

  async create(input: CreateCompartimentoMaterialInput): Promise<CompartimentoMaterial> {
    // Valida que não duplica (mesmo contexto + compartimento).
    const dup = await this.prisma.compartimentoMaterial.findFirst({
      where: { contexto: input.contexto, compartimento: input.compartimento },
    });
    if (dup) {
      throw new ConflictException(
        `Compartimento "${input.compartimento}" já existe para "${input.contextoLabel}"`,
      );
    }
    const max = await this.prisma.compartimentoMaterial.findFirst({
      where: { contexto: input.contexto },
      orderBy: { ordem: 'desc' },
      select: { ordem: true },
    });
    const ordem = input.ordem ?? (max ? max.ordem + 1 : 0);
    const row = await this.prisma.compartimentoMaterial.create({
      data: {
        contexto: input.contexto,
        contextoLabel: input.contextoLabel,
        compartimento: input.compartimento,
        materiais: input.materiais as unknown as object,
        ordem,
        ativo: true,
      },
    });
    return toCompartimento(row);
  }

  async update(
    id: string,
    input: UpdateCompartimentoMaterialInput,
  ): Promise<CompartimentoMaterial> {
    await this.findById(id);
    const data: Prisma.CompartimentoMaterialUpdateInput = {};
    if (input.contexto !== undefined) data.contexto = input.contexto;
    if (input.contextoLabel !== undefined) data.contextoLabel = input.contextoLabel;
    if (input.compartimento !== undefined) data.compartimento = input.compartimento;
    if (input.materiais !== undefined)
      data.materiais = input.materiais as unknown as Prisma.InputJsonValue;
    if (input.ordem !== undefined) data.ordem = input.ordem;
    if (input.ativo !== undefined) data.ativo = input.ativo;
    const row = await this.prisma.compartimentoMaterial.update({ where: { id }, data });
    return toCompartimento(row);
  }

  async softDelete(id: string): Promise<CompartimentoMaterial> {
    return this.update(id, { ativo: false });
  }
}

@Injectable()
export class ConferenciaMaterialV2Service {
  constructor(private readonly prisma: PrismaService) {}

  async getByDataEContexto(data: string, contexto: string): Promise<ConferenciaMaterialV2 | null> {
    const row = await this.prisma.conferenciaMaterial.findUnique({
      where: { data_contexto: { data, contexto } },
    });
    return row ? toConferenciaMaterial(row) : null;
  }

  async registrar(
    input: RegistrarConferenciaMaterialInput,
    realizadoPorNf: string,
  ): Promise<ConferenciaMaterialV2> {
    const row = await this.prisma.conferenciaMaterial.upsert({
      where: { data_contexto: { data: input.data, contexto: input.contexto } },
      create: {
        data: input.data,
        contexto: input.contexto,
        realizadoPorNf,
        itens: input.itens as unknown as object,
        observacao: input.observacao ?? null,
      },
      update: {
        realizadoPorNf,
        realizadoEm: new Date(),
        itens: input.itens as unknown as object,
        observacao: input.observacao ?? null,
      },
    });
    return toConferenciaMaterial(row);
  }

  async listDoDia(data: string): Promise<ConferenciaMaterialV2[]> {
    const rows = await this.prisma.conferenciaMaterial.findMany({
      where: { data },
      orderBy: { contexto: 'asc' },
    });
    return rows.map(toConferenciaMaterial);
  }
}

function toCompartimento(r: PrismaCompartimento): CompartimentoMaterial {
  return {
    id: r.id,
    contexto: r.contexto,
    contextoLabel: r.contextoLabel,
    compartimento: r.compartimento,
    materiais: (r.materiais as unknown as string[]) ?? [],
    ordem: r.ordem,
    ativo: r.ativo,
    criadoEm: r.criadoEm.toISOString(),
    atualizadoEm: r.atualizadoEm.toISOString(),
  };
}

function toConferenciaMaterial(r: PrismaConferenciaMaterial): ConferenciaMaterialV2 {
  return {
    id: r.id,
    data: r.data,
    contexto: r.contexto,
    realizadoPorNf: r.realizadoPorNf,
    realizadoEm: r.realizadoEm.toISOString(),
    itens: (r.itens as unknown as ItemConferenciaMaterialV2[]) ?? [],
    observacao: r.observacao ?? undefined,
  };
}
