import { Injectable } from '@nestjs/common';
import type {
  ComposicaoEntry,
  EscalaDiff,
  EscalaMensal,
  LetraEquipe,
  LetraEquipeRotativa,
} from '@argus/shared-types';

interface EscalaKey {
  ano: number;
  mes: number;
}

function key(k: EscalaKey): string {
  return `${k.ano}-${String(k.mes).padStart(2, '0')}`;
}

/**
 * Resolve a quinzena (1 ou 2) de um dia ISO usando a fronteira gravada na
 * escala pelo parser. `ultimoDiaQ1` é 13 ou 14 conforme o nome da 1ª aba
 * do XLSX original.
 */
export function quinzenaDoDia(diaIso: string, escala: EscalaMensal): 1 | 2 {
  const dia = Number.parseInt(diaIso.slice(8, 10), 10);
  return dia <= escala.composicaoPorQuinzena.ultimoDiaQ1 ? 1 : 2;
}

function diffComposicao(
  antes: ComposicaoEntry[],
  depois: ComposicaoEntry[],
): EscalaDiff['composicaoAlteradaPorQuinzena']['q1'] {
  const compKey = (e: { equipe: LetraEquipe; viatura: string; funcao: string }) =>
    `${e.equipe}|${e.viatura}|${e.funcao}`;
  const mapAntes = new Map(antes.map((e) => [compKey(e), e.militar.raw]));
  const mapDepois = new Map(depois.map((e) => [compKey(e), e.militar.raw]));
  const allKeys = new Set([...mapAntes.keys(), ...mapDepois.keys()]);
  const out: EscalaDiff['composicaoAlteradaPorQuinzena']['q1'] = [];
  for (const k of [...allKeys].sort()) {
    const a = mapAntes.get(k) ?? null;
    const b = mapDepois.get(k) ?? null;
    if (a !== b) {
      const [equipe, viatura, funcao] = k.split('|') as [LetraEquipe, string, string];
      out.push({ equipe, viatura, funcao, antes: a, depois: b });
    }
  }
  return out;
}

/**
 * Computa o diff entre duas escalas do mesmo mês/ano. Útil para reupload — antes de
 * sobrescrever uma escala vigente, mostra o que vai mudar. Composição é comparada
 * separadamente por quinzena.
 */
export function computeDiff(antes: EscalaMensal, depois: EscalaMensal): EscalaDiff {
  const dias = new Set<string>([...Object.keys(antes.diaEquipe), ...Object.keys(depois.diaEquipe)]);
  const diasAlterados: EscalaDiff['diasAlterados'] = [];
  for (const data of [...dias].sort()) {
    const a = antes.diaEquipe[data] ?? null;
    const b = depois.diaEquipe[data] ?? null;
    if (a !== b) diasAlterados.push({ data, equipeAntes: a, equipeDepois: b });
  }

  return {
    diasAlterados,
    composicaoAlteradaPorQuinzena: {
      q1: diffComposicao(antes.composicaoPorQuinzena.q1, depois.composicaoPorQuinzena.q1),
      q2: diffComposicao(antes.composicaoPorQuinzena.q2, depois.composicaoPorQuinzena.q2),
    },
  };
}

/**
 * Mock service in-memory. Em S5 esse storage migra para Prisma+Supabase.
 */
@Injectable()
export class EscalasService {
  private readonly byMes = new Map<string, EscalaMensal>();

  list(): { escalas: { ano: number; mes: number; origemArquivo: string; importadoEm: string }[] } {
    const escalas = [...this.byMes.values()]
      .map((e) => ({
        ano: e.ano,
        mes: e.mes,
        origemArquivo: e.origemArquivo,
        importadoEm: e.importadoEm,
      }))
      .sort((a, b) => b.ano - a.ano || b.mes - a.mes);
    return { escalas };
  }

  get(ano: number, mes: number): EscalaMensal | null {
    return this.byMes.get(key({ ano, mes })) ?? null;
  }

  /**
   * Upserta a escala do mês. Se já existir, sobrescreve completamente — o caller é
   * responsável por confirmar o diff antes (via preview/confirm).
   */
  save(escala: EscalaMensal): EscalaMensal {
    this.byMes.set(key(escala), escala);
    return escala;
  }

  delete(ano: number, mes: number): boolean {
    return this.byMes.delete(key({ ano, mes }));
  }

  /**
   * Lista os escalados de uma equipe num dia específico (composição da equipe que
   * está escalada nesse dia). Resolve a quinzena pelo dia consultado — toda a
   * tradução dia→quinzena fica encapsulada aqui, downstream (Prévia/Fiscais) não
   * precisa conhecer o conceito de quinzena.
   */
  getEscaladosDoDia(
    ano: number,
    mes: number,
    diaIso: string,
  ): { equipe: LetraEquipeRotativa | null; entries: ComposicaoEntry[] } {
    const escala = this.get(ano, mes);
    if (!escala) return { equipe: null, entries: [] };
    const equipe = escala.diaEquipe[diaIso] ?? null;
    if (!equipe) return { equipe: null, entries: [] };
    const q = quinzenaDoDia(diaIso, escala);
    const bucket = q === 1 ? escala.composicaoPorQuinzena.q1 : escala.composicaoPorQuinzena.q2;
    const entries = bucket.filter((c) => c.equipe === equipe);
    return { equipe, entries };
  }

  /**
   * F4 — Atualiza a equipe escalada para um dia específico (ou remove se equipe=null).
   * Retorna a escala atualizada. Lança Error se mês/ano não foi importado.
   */
  updateDiaEquipe(
    ano: number,
    mes: number,
    data: string,
    equipe: LetraEquipeRotativa | null,
  ): EscalaMensal {
    const escala = this.get(ano, mes);
    if (!escala) {
      throw new Error(`Escala ${String(mes).padStart(2, '0')}/${ano} não importada`);
    }
    const novoMapa = { ...escala.diaEquipe };
    if (equipe === null) {
      delete novoMapa[data];
    } else {
      novoMapa[data] = equipe;
    }
    const atualizada: EscalaMensal = { ...escala, diaEquipe: novoMapa };
    this.byMes.set(key(escala), atualizada);
    return atualizada;
  }

  /**
   * F4 — Upsert/delete de uma posição da composição em uma quinzena específica.
   * Quando `militar=null`, remove. Quando preenchido, sobrescreve por chave
   * (equipe, viatura, funcao). A outra quinzena não é afetada.
   */
  upsertComposicao(
    ano: number,
    mes: number,
    quinzena: 1 | 2,
    entry:
      | ComposicaoEntry
      | { equipe: LetraEquipe; viatura: string; funcao: string; militar: null },
  ): EscalaMensal {
    const escala = this.get(ano, mes);
    if (!escala) {
      throw new Error(`Escala ${String(mes).padStart(2, '0')}/${ano} não importada`);
    }
    const matchKey = (c: { equipe: string; viatura: string; funcao: string }) =>
      `${c.equipe}|${c.viatura}|${c.funcao}`;
    const target = matchKey(entry);
    const bucketKey = quinzena === 1 ? 'q1' : 'q2';
    const filtered = escala.composicaoPorQuinzena[bucketKey].filter(
      (c) => matchKey(c) !== target,
    );
    if (entry.militar !== null) {
      filtered.push(entry as ComposicaoEntry);
    }
    const atualizada: EscalaMensal = {
      ...escala,
      composicaoPorQuinzena: {
        ...escala.composicaoPorQuinzena,
        [bucketKey]: filtered,
      },
    };
    this.byMes.set(key(escala), atualizada);
    return atualizada;
  }

  /** Reset usado nos testes. */
  reset(): void {
    this.byMes.clear();
  }
}
