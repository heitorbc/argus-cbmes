import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { CategoriaRecurso, Recurso } from '@argus/shared-types';
import { UNIDADE_1CIA_1BBM_ID } from '../unidades/unidades.service';

/**
 * Cadastro de Recursos por Unidade.
 *
 * Fase 1 (S6d): seed hardcoded da 1ª1º (19 recursos espelhando o MF). Sem CRUD UI.
 * Migra a whitelist `RECURSOS_VALIDOS` (parser) e `RECURSOS_STAFF`/`RECURSOS_AQUATICAS`
 * (previa) para esta entidade.
 *
 * Persistência in-memory (Fase 1); migra para Prisma+Supabase em S5b.
 */
@Injectable()
export class RecursosService implements OnModuleInit {
  private readonly recursos: Map<string, Recurso> = new Map();

  onModuleInit(): void {
    this.seed1aCia1Bbm();
  }

  list(filter: { unidadeId?: string; ativoSomente?: boolean } = {}): Recurso[] {
    const all = Array.from(this.recursos.values());
    return all
      .filter((r) => (filter.unidadeId ? r.unidadeId === filter.unidadeId : true))
      .filter((r) => (filter.ativoSomente ? r.ativo : true))
      .sort((a, b) => a.ordem - b.ordem);
  }

  findById(id: string): Recurso {
    const r = this.recursos.get(id);
    if (!r) throw new NotFoundException(`Recurso ${id} não encontrado`);
    return r;
  }

  /** Procura por nome canônico dentro de uma unidade (case-sensitive — espelha MF). */
  findByNome(unidadeId: string, nome: string): Recurso | undefined {
    return this.list({ unidadeId }).find((r) => r.nome === nome);
  }

  /**
   * Atalhos consumidos pelo parser MF e pela PreviaService.
   *
   * `nomesValidos`: equivalente ao antigo `RECURSOS_VALIDOS` (whitelist do parser).
   * `nomesPorCategoria`: equivalente ao antigo `RECURSOS_STAFF`/`RECURSOS_AQUATICAS`.
   */
  nomesValidos(unidadeId: string): Set<string> {
    return new Set(this.list({ unidadeId, ativoSomente: true }).map((r) => r.nome));
  }

  nomesPorCategoria(unidadeId: string, categoria: CategoriaRecurso): string[] {
    return this.list({ unidadeId, ativoSomente: true })
      .filter((r) => r.categoria === categoria)
      .map((r) => r.nome);
  }

  /**
   * Seed da 1ª1º — espelha a ordem da planilha MF aba "1º BBM".
   *
   * Flags de cada recurso (ABTS_01 ... GUARDA):
   *   - comportaViatura: tem prefixo de viatura no MF
   *   - comportaEfetivo: tem militares no MF
   *   - categoria: define bucket de Tripulação na Prévia
   */
  private seed1aCia1Bbm(): void {
    const now = new Date().toISOString();
    const unidadeId = UNIDADE_1CIA_1BBM_ID;
    const seed: Array<Omit<Recurso, 'id' | 'unidadeId' | 'criadoEm' | 'atualizadoEm'>> = [
      {
        nome: 'ABTS_01',
        categoria: 'OPERACIONAL',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 1,
      },
      {
        nome: 'ABTS_02',
        categoria: 'OPERACIONAL',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 2,
      },
      {
        nome: 'ATB',
        categoria: 'OPERACIONAL',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 3,
      },
      {
        nome: 'PLATAFORMA',
        categoria: 'OPERACIONAL',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 4,
      },
      {
        nome: 'FLORESTAL',
        categoria: 'OPERACIONAL',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 5,
      },
      {
        nome: 'EQUIPE SATURAÇÃO',
        categoria: 'OPERACIONAL',
        ativo: true,
        comportaViatura: false,
        comportaEfetivo: true,
        ordem: 6,
      },
      {
        nome: 'RESGATE 01',
        categoria: 'OPERACIONAL',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 7,
      },
      {
        nome: 'RESGATE 02',
        categoria: 'OPERACIONAL',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 8,
      },
      {
        nome: 'CHEFE DE OPERAÇÕES',
        categoria: 'STAFF',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 9,
      },
      {
        nome: 'SALVAMAR 01',
        categoria: 'AQUATICA',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 10,
      },
      {
        nome: 'SALVAMAR 02',
        categoria: 'AQUATICA',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 11,
      },
      {
        nome: 'QUADRICICLO 01',
        categoria: 'AQUATICA',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 12,
      },
      {
        nome: 'QUADRICICLO 02',
        categoria: 'AQUATICA',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 13,
      },
      {
        nome: 'MERGULHO 01',
        categoria: 'AQUATICA',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 14,
      },
      {
        nome: 'MERGULHO 02',
        categoria: 'AQUATICA',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 15,
      },
      {
        nome: 'REPDEC 01',
        categoria: 'OPERACIONAL',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 16,
      },
      {
        nome: 'REPDEC 02',
        categoria: 'OPERACIONAL',
        ativo: true,
        comportaViatura: true,
        comportaEfetivo: true,
        ordem: 17,
      },
      {
        nome: 'DRO / TELEFONISTA',
        categoria: 'OPERACIONAL',
        ativo: true,
        comportaViatura: false,
        comportaEfetivo: true,
        ordem: 18,
      },
      {
        nome: 'GUARDA',
        categoria: 'GUARDA',
        ativo: true,
        comportaViatura: false,
        comportaEfetivo: true,
        ordem: 19,
      },
    ];

    for (const r of seed) {
      const id = `recurso:${unidadeId}:${slugify(r.nome)}`;
      this.recursos.set(id, {
        id,
        unidadeId,
        ...r,
        criadoEm: now,
        atualizadoEm: now,
      });
    }
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
