import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { Unidade } from '@argus/shared-types';

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
