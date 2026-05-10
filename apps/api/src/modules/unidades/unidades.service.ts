import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CreateUnidadeInput, Unidade, UpdateUnidadeInput } from '@argus/shared-types';

/** Slug fixo da única unidade da Fase 1 (1ª Cia / 1º BBM). */
export const UNIDADE_1CIA_1BBM_ID = 'unid:1cia-1bbm';

/**
 * Cadastro de Unidades institucionais.
 *
 * Fase 1 (S6d): seed hardcoded com **1ª1º** apenas. Sem CRUD UI.
 * Fases futuras: S6e/S6f abrem CRUD admin; S5b migra para Prisma.
 *
 * Read-only para callers — apenas o seed inicial popula o storage.
 */
@Injectable()
export class UnidadesService implements OnModuleInit {
  private readonly unidades: Map<string, Unidade> = new Map();

  onModuleInit(): void {
    this.seed();
  }

  list(): Unidade[] {
    return Array.from(this.unidades.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
  }

  findById(id: string): Unidade {
    const u = this.unidades.get(id);
    if (!u) throw new NotFoundException(`Unidade ${id} não encontrada`);
    return u;
  }

  findByCodigo(codigo: string): Unidade | undefined {
    return this.list().find((u) => u.codigo === codigo);
  }

  /**
   * S6e — cria nova Unidade. `codigo` deve ser único.
   * `ativo` default true.
   */
  create(input: CreateUnidadeInput): Unidade {
    if (this.findByCodigo(input.codigo)) {
      throw new ConflictException(`Unidade com código "${input.codigo}" já existe`);
    }
    const now = new Date().toISOString();
    const unidade: Unidade = {
      id: `unid:${randomUUID()}`,
      codigo: input.codigo,
      nome: input.nome,
      ativo: input.ativo ?? true,
      criadoEm: now,
      atualizadoEm: now,
    };
    this.unidades.set(unidade.id, unidade);
    return unidade;
  }

  /**
   * S6e — atualiza Unidade. Se `codigo` mudar, garante unicidade.
   * Não muda `id` nem `criadoEm`.
   */
  update(id: string, input: UpdateUnidadeInput): Unidade {
    const current = this.findById(id);
    if (input.codigo && input.codigo !== current.codigo) {
      const conflict = this.findByCodigo(input.codigo);
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`Unidade com código "${input.codigo}" já existe`);
      }
    }
    const updated: Unidade = {
      ...current,
      codigo: input.codigo ?? current.codigo,
      nome: input.nome ?? current.nome,
      ativo: input.ativo ?? current.ativo,
      atualizadoEm: new Date().toISOString(),
    };
    this.unidades.set(updated.id, updated);
    return updated;
  }

  /**
   * S6e — soft delete: marca `ativo=false`. Não remove a Unidade do storage
   * (preserva histórico e relação com Recursos).
   */
  softDelete(id: string): Unidade {
    return this.update(id, { ativo: false });
  }

  private seed(): void {
    const now = new Date().toISOString();
    const u: Unidade = {
      id: UNIDADE_1CIA_1BBM_ID,
      codigo: '1ª1º',
      nome: '1ª Cia / 1º BBM',
      ativo: true,
      criadoEm: now,
      atualizadoEm: now,
    };
    this.unidades.set(u.id, u);
  }
}
