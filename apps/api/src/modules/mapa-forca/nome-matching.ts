import type { Militar, MilitarRef } from '@argus/shared-types';
import { previaMatchKey } from '@argus/shared-types';

/**
 * Resultado da resolução nome→NF.
 * - `resolved`: militar único encontrado.
 * - `null`: ausência ou ambiguidade — caller registra inconsistência apropriada.
 */
export interface ResolveResult {
  resolved: Militar | null;
  ambiguidade: boolean;
}

/**
 * Indexa o efetivo (1ª Cia consolidado QDI+EFETIVO) por chaves normalizadas.
 * Constrói 3 índices em ordem de precisão:
 *   - postoAbreviado + nomeGuerra (mais preciso)
 *   - somente nomeGuerra (fallback quando posto no XLSX está desatualizado)
 *   - nomeGuerra parcial (token-by-token, ignora pontuação tipo "D. MATTOS" vs "MATTOS")
 */
export class NomeMatcher {
  private readonly byPostoNome = new Map<string, Militar[]>();
  private readonly byNome = new Map<string, Militar[]>();
  private readonly byTokenInicial = new Map<string, Militar[]>();

  constructor(efetivo: readonly Militar[]) {
    for (const m of efetivo) {
      if (!m.nomeGuerra) continue;
      const fullKey = previaMatchKey(m.posto, m.nomeGuerra);
      pushTo(this.byPostoNome, fullKey, m);

      const nameKey = previaMatchKey('', m.nomeGuerra).slice(1); // remove leading "|"
      pushTo(this.byNome, nameKey, m);

      // Indexa pelo primeiro token significativo do nome de guerra (caso "D. MATTOS" vs "MATTOS")
      for (const tok of tokenizeNome(m.nomeGuerra)) {
        pushTo(this.byTokenInicial, tok, m);
      }
    }
  }

  resolve(ref: MilitarRef): ResolveResult {
    if (ref.nf) {
      // Já veio com NF (raríssimo no S4 — parser não preenche, mas reservado).
      return { resolved: null, ambiguidade: false };
    }

    // 1) posto + nomeGuerra exato
    const fullKey = previaMatchKey(ref.postoAbreviado, ref.nomeGuerra);
    const exact = this.byPostoNome.get(fullKey);
    if (exact && exact.length === 1) return { resolved: exact[0]!, ambiguidade: false };
    if (exact && exact.length > 1) return { resolved: null, ambiguidade: true };

    // 2) somente nomeGuerra
    const nameKey = previaMatchKey('', ref.nomeGuerra).slice(1);
    const byName = this.byNome.get(nameKey);
    if (byName && byName.length === 1) return { resolved: byName[0]!, ambiguidade: false };
    if (byName && byName.length > 1) return { resolved: null, ambiguidade: true };

    // 3) tokens — útil quando XLSX traz "D. MATTOS" e QDI tem "MATTOS" (ou inverso).
    const tokens = tokenizeNome(ref.nomeGuerra);
    const candidates = new Set<Militar>();
    for (const t of tokens) {
      const list = this.byTokenInicial.get(t);
      if (list) for (const m of list) candidates.add(m);
    }
    if (candidates.size === 1) {
      return { resolved: [...candidates][0]!, ambiguidade: false };
    }
    if (candidates.size > 1) {
      // Filtra pelo posto se houver
      const filtered = [...candidates].filter((m) =>
        previaMatchKey(m.posto, '').startsWith(previaMatchKey(ref.postoAbreviado, '')),
      );
      if (filtered.length === 1) return { resolved: filtered[0]!, ambiguidade: false };
      return { resolved: null, ambiguidade: true };
    }

    return { resolved: null, ambiguidade: false };
  }
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

function tokenizeNome(nomeGuerra: string): string[] {
  return nomeGuerra
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2); // descarta iniciais soltas tipo "D"
}
