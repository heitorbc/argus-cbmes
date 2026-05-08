import { Injectable } from '@nestjs/common';
import type { EscalaDiff, EscalaMensal, LetraEquipe } from '@argus/shared-types';

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
  ): { equipe: LetraEquipe | null; entries: EscalaMensal['composicao'] } {
    const escala = this.get(ano, mes);
    if (!escala) return { equipe: null, entries: [] };
    const equipe = escala.diaEquipe[diaIso] ?? null;
    if (!equipe) return { equipe: null, entries: [] };
    const entries = escala.composicao.filter((c) => c.equipe === equipe);
    return { equipe, entries };
  }

  /** Reset usado nos testes. */
  reset(): void {
    this.byMes.clear();
  }
}
