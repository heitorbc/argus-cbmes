import { Injectable } from '@nestjs/common';
import type {
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
 * Computa o diff entre duas escalas do mesmo mês/ano. Útil para reupload — antes de
 * sobrescrever uma escala vigente, mostra o que vai mudar.
 */
export function computeDiff(antes: EscalaMensal, depois: EscalaMensal): EscalaDiff {
  const dias = new Set<string>([...Object.keys(antes.diaEquipe), ...Object.keys(depois.diaEquipe)]);
  const diasAlterados: EscalaDiff['diasAlterados'] = [];
  for (const data of [...dias].sort()) {
    const a = antes.diaEquipe[data] ?? null;
    const b = depois.diaEquipe[data] ?? null;
    if (a !== b) diasAlterados.push({ data, equipeAntes: a, equipeDepois: b });
  }

  const compKey = (e: { equipe: LetraEquipe; viatura: string; funcao: string }) =>
    `${e.equipe}|${e.viatura}|${e.funcao}`;
  const mapAntes = new Map(antes.composicao.map((e) => [compKey(e), e.militar.raw]));
  const mapDepois = new Map(depois.composicao.map((e) => [compKey(e), e.militar.raw]));
  const allKeys = new Set([...mapAntes.keys(), ...mapDepois.keys()]);
  const composicaoAlterada: EscalaDiff['composicaoAlterada'] = [];
  for (const k of [...allKeys].sort()) {
    const a = mapAntes.get(k) ?? null;
    const b = mapDepois.get(k) ?? null;
    if (a !== b) {
      const [equipe, viatura, funcao] = k.split('|') as [LetraEquipe, string, string];
      composicaoAlterada.push({ equipe, viatura, funcao, antes: a, depois: b });
    }
  }
  return { diasAlterados, composicaoAlterada };
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
   * está escalada nesse dia). Útil para Fiscais.getVigente e para a Prévia (S4).
   */
  getEscaladosDoDia(
    ano: number,
    mes: number,
    diaIso: string,
  ): { equipe: LetraEquipeRotativa | null; entries: EscalaMensal['composicao'] } {
    const escala = this.get(ano, mes);
    if (!escala) return { equipe: null, entries: [] };
    const equipe = escala.diaEquipe[diaIso] ?? null;
    if (!equipe) return { equipe: null, entries: [] };
    const entries = escala.composicao.filter((c) => c.equipe === equipe);
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
   * F4 — Upsert/delete de uma posição da composição. Quando `militar=null`, remove.
   * Quando preenchido, sobrescreve por chave (equipe, viatura, funcao).
   */
  upsertComposicao(
    ano: number,
    mes: number,
    entry:
      | EscalaMensal['composicao'][number]
      | { equipe: LetraEquipe; viatura: string; funcao: string; militar: null },
  ): EscalaMensal {
    const escala = this.get(ano, mes);
    if (!escala) {
      throw new Error(`Escala ${String(mes).padStart(2, '0')}/${ano} não importada`);
    }
    const matchKey = (c: { equipe: string; viatura: string; funcao: string }) =>
      `${c.equipe}|${c.viatura}|${c.funcao}`;
    const target = matchKey(entry);
    const filtered = escala.composicao.filter((c) => matchKey(c) !== target);
    if (entry.militar !== null) {
      filtered.push(entry as EscalaMensal['composicao'][number]);
    }
    const atualizada: EscalaMensal = { ...escala, composicao: filtered };
    this.byMes.set(key(escala), atualizada);
    return atualizada;
  }

  /** Reset usado nos testes. */
  reset(): void {
    this.byMes.clear();
  }
}
