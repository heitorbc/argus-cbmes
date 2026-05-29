import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type {
  CreateUnidadeInput,
  TipoUnidade,
  Unidade,
  UpdateUnidadeInput,
  UserSession,
} from '@argus/shared-types';
import type { Unidade as PrismaUnidade } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Slug fixo da unidade-raiz do CBMES Fase 1 (1º BBM — batalhão). */
export const UNIDADE_1BBM_ID = 'unid:1bbm';
/** Slug fixo da 1ª Cia (filha do 1º BBM, hierarquia S2.13a). */
export const UNIDADE_1CIA_1BBM_ID = 'unid:1cia-1bbm';

/** Código institucional do 1º BBM — usado pelo seed. */
export const UNIDADE_1BBM_CODIGO = '1º BBM';
/** Código institucional da 1ª Cia/1º BBM — usado pelo seed e busca. */
export const UNIDADE_1CIA_1BBM_CODIGO = '1ª1º';

/**
 * Cadastro de Unidades institucionais — fonte de verdade em Postgres (S2.10.3).
 *
 * S2.13a — hierarquia (tipo + unidadePaiId). Sargenteante/Oficial de Operações
 * de uma unidade vê própria unidade + descendentes (companhia "abrange" postos
 * avançados ligados a ela). Admin vê tudo.
 */
@Injectable()
export class UnidadesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureHierarquia1Bbm();
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
    if (input.unidadePaiId) {
      const pai = await this.prisma.unidade.findUnique({ where: { id: input.unidadePaiId } });
      if (!pai) throw new BadRequestException(`Unidade pai ${input.unidadePaiId} não encontrada`);
    }
    const u = await this.prisma.unidade.create({
      data: {
        codigo: input.codigo,
        nome: input.nome,
        tipo: input.tipo ?? 'companhia',
        unidadePaiId: input.unidadePaiId ?? null,
        ativo: input.ativo ?? true,
      },
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
    if (input.unidadePaiId !== undefined) {
      // S2.13a — evita ciclo: pai não pode ser descendente de si mesmo.
      if (input.unidadePaiId === id) {
        throw new BadRequestException('Unidade não pode ser pai de si mesma');
      }
      if (input.unidadePaiId !== null) {
        const descendentes = await this.descendantsOf(id);
        if (descendentes.some((d) => d.id === input.unidadePaiId)) {
          throw new BadRequestException(
            'Ciclo detectado: a unidade pai escolhida é descendente desta unidade',
          );
        }
      }
    }
    const u = await this.prisma.unidade.update({
      where: { id },
      data: {
        codigo: input.codigo ?? current.codigo,
        nome: input.nome ?? current.nome,
        tipo: input.tipo ?? current.tipo,
        unidadePaiId: input.unidadePaiId === undefined ? current.unidadePaiId : input.unidadePaiId,
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
   * S2.13a — Retorna todos os descendentes (filhos, netos, ...) de uma unidade.
   * BFS via varredura. Inclui apenas unidades existentes (ativas ou inativas);
   * caller filtra ativos quando necessário.
   *
   * Não inclui a própria unidade na lista — apenas descendentes.
   */
  async descendantsOf(id: string): Promise<Unidade[]> {
    const todas = await this.prisma.unidade.findMany();
    const porPai = new Map<string, PrismaUnidade[]>();
    for (const u of todas) {
      if (!u.unidadePaiId) continue;
      const arr = porPai.get(u.unidadePaiId);
      if (arr) arr.push(u);
      else porPai.set(u.unidadePaiId, [u]);
    }
    const out: PrismaUnidade[] = [];
    const fila: string[] = [id];
    const visitados = new Set<string>([id]);
    while (fila.length > 0) {
      const atual = fila.shift()!;
      const filhos = porPai.get(atual) ?? [];
      for (const f of filhos) {
        if (visitados.has(f.id)) continue;
        visitados.add(f.id);
        out.push(f);
        fila.push(f.id);
      }
    }
    return out.map(toUnidade);
  }

  /**
   * S2.13a — Retorna as unidades visíveis para o usuário.
   *
   * - Admin (ou usuário sem `unidadeId` por sessão legada): todas as unidades
   * - Demais usuários: própria unidade + todos os descendentes
   *
   * Caller usa para filtrar queries — escala, efetivo, recursos, etc.
   */
  async visiveisParaUsuario(user: UserSession): Promise<Unidade[]> {
    if (user.papeis.includes('admin') || !user.unidadeId) {
      return this.list();
    }
    const minha = await this.prisma.unidade.findUnique({ where: { id: user.unidadeId } });
    if (!minha) return []; // unidade do usuário removida — sem acesso
    const descendentes = await this.descendantsOf(user.unidadeId);
    return [toUnidade(minha), ...descendentes];
  }

  /**
   * Helper para guards/middlewares — retorna apenas IDs.
   */
  async idsVisiveisParaUsuario(user: UserSession): Promise<string[]> {
    const unidades = await this.visiveisParaUsuario(user);
    return unidades.map((u) => u.id);
  }

  /**
   * S2.13a — Garante a hierarquia 1º BBM (batalhao) → 1ª Cia (companhia).
   * Idempotente. Substitui o antigo `ensure1aCia` (também via upsert), agora
   * com 2 níveis. Tolerante a banco indisponível.
   */
  private async ensureHierarquia1Bbm(): Promise<void> {
    try {
      await this.prisma.unidade.upsert({
        where: { codigo: UNIDADE_1BBM_CODIGO },
        update: {},
        create: {
          id: UNIDADE_1BBM_ID,
          codigo: UNIDADE_1BBM_CODIGO,
          nome: '1º Batalhão de Bombeiro Militar',
          tipo: 'batalhao',
          unidadePaiId: null,
          ativo: true,
        },
      });
      await this.prisma.unidade.upsert({
        where: { codigo: UNIDADE_1CIA_1BBM_CODIGO },
        update: {
          // S2.13a — garante hierarquia mesmo se registro existe pré-S2.13a
          tipo: 'companhia',
          unidadePaiId: UNIDADE_1BBM_ID,
        },
        create: {
          id: UNIDADE_1CIA_1BBM_ID,
          codigo: UNIDADE_1CIA_1BBM_CODIGO,
          nome: '1ª Cia / 1º BBM',
          tipo: 'companhia',
          unidadePaiId: UNIDADE_1BBM_ID,
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
    tipo: u.tipo as TipoUnidade,
    unidadePaiId: u.unidadePaiId,
    ativo: u.ativo,
    criacaoAutomatica: u.criacaoAutomatica,
    criadoEm: u.criadoEm.toISOString(),
    atualizadoEm: u.atualizadoEm.toISOString(),
  };
}
