import type { Militar, MilitarRef } from '@argus/shared-types';
import { previaMatchKey } from '@argus/shared-types';

/**
 * Resultado da resolução nome→NF.
 * - `resolved`: militar único encontrado.
 * - `null`: ausência ou ambiguidade — caller registra inconsistência apropriada.
 * - `divergencia`: S2.12c — sinalizado quando `ref.nf` casa no efetivo mas
 *   posto e/ou nomeGuerra na referência (XLSX/planilha) divergem do que está
 *   no efetivo. Match continua válido (NF é fonte de verdade), mas caller
 *   pode logar para o Tech Lead corrigir grafia na fonte.
 */
export interface ResolveResult {
  resolved: Militar | null;
  ambiguidade: boolean;
  divergencia?: {
    postoRef: string;
    postoEfetivo: string;
    nomeGuerraRef: string;
    nomeGuerraEfetivo: string;
  };
}

/**
 * Indexa o efetivo (1ª Cia consolidado QDI+EFETIVO) por chaves normalizadas.
 * Constrói 4 índices em ordem de precisão:
 *   - NF (chave única — fonte primária quando preenchida, ex.: vinda do
 *     Sheets-DB ou de planilha externa com NF direto)
 *   - postoAbreviado + nomeGuerra (mais preciso por nome)
 *   - somente nomeGuerra (fallback quando posto no XLSX está desatualizado)
 *   - nomeGuerra parcial (token-by-token, ignora pontuação tipo "D. MATTOS" vs "MATTOS")
 */
export class NomeMatcher {
  private readonly byNf = new Map<string, Militar>();
  private readonly byPostoNome = new Map<string, Militar[]>();
  private readonly byNome = new Map<string, Militar[]>();
  private readonly byTokenInicial = new Map<string, Militar[]>();

  constructor(efetivo: readonly Militar[]) {
    for (const m of efetivo) {
      if (m.nf) this.byNf.set(m.nf, m);
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
    // S2.8.x — Quando o NF já vier preenchido (Sheets-DB, planilha de
    // Trocas Autorizadas com NF direto, etc.), busca diretamente por NF.
    // Antes este caminho retornava `null` silenciosamente — bug que quebrava
    // a integração Mapa Força ↔ Efetivo após bootstrap Sheets-DB (S2.8.2).
    if (ref.nf) {
      const direct = this.byNf.get(ref.nf);
      if (direct) {
        // S2.12c — Detecta posto/nomeGuerra divergentes entre a referência
        // (XLSX/planilha) e o efetivo (QDI). NF continua sendo fonte de
        // verdade, mas a divergência denuncia grafia desatualizada na
        // fonte — caller pode logar para o Tech Lead corrigir.
        const postoNorm = normalizeForCompare(ref.postoAbreviado);
        const nomeNorm = normalizeForCompare(ref.nomeGuerra);
        const postoEfNorm = normalizeForCompare(direct.posto);
        const nomeEfNorm = normalizeForCompare(direct.nomeGuerra);
        if (
          (postoNorm && postoEfNorm && postoNorm !== postoEfNorm) ||
          (nomeNorm && nomeEfNorm && nomeNorm !== nomeEfNorm)
        ) {
          return {
            resolved: direct,
            ambiguidade: false,
            divergencia: {
              postoRef: ref.postoAbreviado,
              postoEfetivo: direct.posto,
              nomeGuerraRef: ref.nomeGuerra,
              nomeGuerraEfetivo: direct.nomeGuerra ?? '',
            },
          };
        }
        return { resolved: direct, ambiguidade: false };
      }
      // NF informado mas não está no efetivo — caller registra inconsistência
      // (militar foi escalado mas ainda não foi lançado no QDI ex.: DRH atrasado).
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

function normalizeForCompare(s: string | undefined): string {
  if (!s) return '';
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s.,]+/g, '')
    .trim();
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
