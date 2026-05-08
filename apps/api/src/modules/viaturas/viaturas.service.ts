import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CreateViaturaInput, UpdateViaturaInput, Viatura } from '@argus/shared-types';
import { buildInitialViaturas } from './mock-viaturas';

@Injectable()
export class ViaturasService {
  /** Storage in-memory para Fase 1 mock; migra para Prisma em S5. */
  private readonly viaturas: Map<string, Viatura>;

  constructor() {
    this.viaturas = new Map();
    for (const v of buildInitialViaturas()) {
      this.viaturas.set(v.id, v);
    }
  }

  list(): Viatura[] {
    return Array.from(this.viaturas.values()).sort((a, b) => a.prefixo.localeCompare(b.prefixo));
  }

  findByPrefixo(prefixo: string): Viatura | undefined {
    return this.list().find((v) => v.prefixo === prefixo);
  }

  findById(id: string): Viatura {
    const v = this.viaturas.get(id);
    if (!v) {
      throw new NotFoundException(`Viatura ${id} não encontrada`);
    }
    return v;
  }

  create(input: CreateViaturaInput): Viatura {
    if (this.findByPrefixo(input.prefixo)) {
      throw new ConflictException(`Viatura com prefixo "${input.prefixo}" já existe`);
    }
    const now = new Date().toISOString();
    const viatura: Viatura = {
      ...input,
      id: randomUUID(),
      composicaoFuncoes: input.composicaoFuncoes ?? [],
      criadoEm: now,
      atualizadoEm: now,
    };
    this.viaturas.set(viatura.id, viatura);
    return viatura;
  }

  update(id: string, input: UpdateViaturaInput): Viatura {
    const current = this.findById(id);
    if (input.prefixo && input.prefixo !== current.prefixo) {
      const existing = this.findByPrefixo(input.prefixo);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Viatura com prefixo "${input.prefixo}" já existe`);
      }
    }
    const updated: Viatura = {
      ...current,
      ...input,
      composicaoFuncoes: input.composicaoFuncoes ?? current.composicaoFuncoes,
      id: current.id,
      criadoEm: current.criadoEm,
      atualizadoEm: new Date().toISOString(),
    };
    this.viaturas.set(id, updated);
    return updated;
  }

  /** Soft delete: muda status para 'baixada'. Mantém na lista para histórico (RF-CM-104). */
  softDelete(id: string): Viatura {
    return this.update(id, { status: 'baixada' });
  }
}
