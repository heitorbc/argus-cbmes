import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateViaturaInput,
  RecursoMapaForca,
  StatusVtr,
  StatusViatura,
  TipoViatura,
  UpdateViaturaInput,
  Viatura,
} from '@argus/shared-types';
import { MapaForcaService } from '../mapa-forca/mapa-forca.service';

/** Mapeia o prefixo da viatura (ABTS_011, AR_044) para o tipo institucional. */
function tipoFromPrefixo(prefixo: string): TipoViatura {
  const tag = prefixo.split('_')[0]?.toUpperCase() ?? '';
  if (tag === 'ABTS') return 'ABTS';
  if (tag === 'AR') return 'AR';
  if (tag === 'ATB') return 'ATB';
  if (tag === 'AU') return 'AU';
  if (tag === 'AM') return 'AM';
  if (tag === 'AC') return 'AC';
  if (tag === 'TE') return 'TE';
  // fallback defensivo
  return 'AU';
}

/** Mapeia status do Mapa Força (col C) para status interno do ARGUS. */
function statusFromMapaForca(mf: StatusVtr | null): StatusViatura | null {
  if (mf === null) return null;
  if (mf === 'DISPONIVEL') return 'operacional';
  if (mf === 'BAIXADA') return 'baixada';
  if (mf === 'EMPRESTADA') return 'reserva';
  if (mf === 'NAO_POSSUI') return null; // recurso sem viatura — não cria entry
  return null;
}

/** Constrói uma Viatura sintética a partir de um RecursoMapaForca (apenas se tem prefix + status). */
function viaturaFromRecurso(r: RecursoMapaForca): Viatura | null {
  if (!r.vtrPrefixo) return null;
  const status = statusFromMapaForca(r.vtrStatus);
  if (status === null) return null;
  const now = new Date().toISOString();
  return {
    id: `mf:${r.vtrPrefixo}`,
    prefixo: r.vtrPrefixo,
    tipo: tipoFromPrefixo(r.vtrPrefixo),
    status,
    composicaoFuncoes: [],
    funcaoOperacional: r.recurso, // ex.: "MERGULHO 02", "ABTS_01"
    criadoEm: now,
    atualizadoEm: now,
  };
}

/**
 * Source of truth: aba "1º BBM" do Mapa Força (via `MapaForcaService`).
 * Overrides locais ficam em memória (Fase 1) e sobrepõem por `prefixo`.
 *
 * Em S5b, overrides migram para Prisma. Em paralelo, o admin pode criar viaturas que
 * não estão no Mapa Força (caso edge — ex.: viatura emprestada de outra OBM por dias).
 */
@Injectable()
export class ViaturasService {
  /** Storage in-memory de overrides (admin criou/editou). Key = prefixo. */
  private readonly overrides: Map<string, Viatura> = new Map();

  constructor(private readonly mapaForca: MapaForcaService) {}

  async list(): Promise<Viatura[]> {
    const recursos = await this.mapaForca.getRecursos().catch(() => []);
    const fromMf = recursos
      .map((r) => viaturaFromRecurso(r))
      .filter((v): v is Viatura => v !== null);

    // Aplica overrides por prefixo (admin venceu MF).
    const merged = new Map<string, Viatura>();
    for (const v of fromMf) merged.set(v.prefixo, v);
    for (const v of this.overrides.values()) merged.set(v.prefixo, v);

    return [...merged.values()].sort((a, b) => a.prefixo.localeCompare(b.prefixo));
  }

  async findByPrefixo(prefixo: string): Promise<Viatura | undefined> {
    return (await this.list()).find((v) => v.prefixo === prefixo);
  }

  async findById(id: string): Promise<Viatura> {
    const all = await this.list();
    const found = all.find((v) => v.id === id);
    if (!found) throw new NotFoundException(`Viatura ${id} não encontrada`);
    return found;
  }

  async create(input: CreateViaturaInput): Promise<Viatura> {
    const existing = await this.findByPrefixo(input.prefixo);
    if (existing) {
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
    this.overrides.set(viatura.prefixo, viatura);
    return viatura;
  }

  async update(id: string, input: UpdateViaturaInput): Promise<Viatura> {
    const current = await this.findById(id);
    if (input.prefixo && input.prefixo !== current.prefixo) {
      const conflict = await this.findByPrefixo(input.prefixo);
      if (conflict && conflict.id !== id) {
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
    // Override entra com prefixo (chave) — atualizado override sempre por prefixo.
    this.overrides.delete(current.prefixo);
    this.overrides.set(updated.prefixo, updated);
    return updated;
  }

  /** Soft delete: muda status para 'baixada'. Mantém na lista para histórico (RF-CM-104). */
  async softDelete(id: string): Promise<Viatura> {
    return this.update(id, { status: 'baixada' });
  }
}
