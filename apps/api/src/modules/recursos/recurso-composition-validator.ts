import type { FuncaoEquipeMinima, Recurso } from '@argus/shared-types';

/**
 * S2.13b — Valida composição (tripulação escalada) contra a equipe mínima
 * declarada num Recurso.
 *
 * Não bloqueia import: callers decidem o que fazer com `erros[]` (warn em
 * log, surface na UI da Prévia, etc.).
 *
 * Regras:
 *   - `tipoComposicao === 'viatura_only'` → ignora equipe (sempre ok)
 *   - `equipeMinima === null` → considera ok (recurso configurável sem equipe definida)
 *   - Para cada função obrigatória, busca um militar com `funcao` correspondente
 *   - Funções com `podeAcumularCom` aceitam ser preenchidas pelo mesmo militar
 *     que preencheu outra (ex.: chefe+motorista mesmo militar em RESGATE 02 reduzido)
 *
 * Comparação de função: case-insensitive + ignorando whitespace ao redor.
 */
export interface ComposicaoEntryParaValidacao {
  funcao: string;
  militarRaw: string;
  militarNf?: string | null;
}

export interface ValidacaoComposicao {
  ok: boolean;
  erros: string[];
}

export function validarComposicaoRecurso(
  recurso: Pick<Recurso, 'nome' | 'tipoComposicao' | 'equipeMinima'>,
  composicao: readonly ComposicaoEntryParaValidacao[],
): ValidacaoComposicao {
  const erros: string[] = [];

  if (recurso.tipoComposicao === 'viatura_only') {
    return { ok: true, erros: [] };
  }
  const minima = recurso.equipeMinima;
  if (!minima || minima.length === 0) {
    return { ok: true, erros: [] };
  }

  const normalizada = composicao.map((c) => ({
    ...c,
    funcaoNorm: normalizarFuncao(c.funcao),
  }));

  // Constrói índice: para cada função obrigatória da equipe mínima, lista os
  // militares (por militarRaw/militarNf) que preencheram aquela posição.
  const militarPorFuncao = new Map<string, ComposicaoEntryParaValidacao[]>();
  for (const c of normalizada) {
    const arr = militarPorFuncao.get(c.funcaoNorm);
    if (arr) arr.push(c);
    else militarPorFuncao.set(c.funcaoNorm, [c]);
  }

  for (const req of minima) {
    if (!req.obrigatorio) continue;
    const norm = normalizarFuncao(req.funcao);
    const titulares = militarPorFuncao.get(norm) ?? [];
    if (titulares.length > 0) continue; // preenchida diretamente

    const acumulaveis = (req.podeAcumularCom ?? []).map(normalizarFuncao);
    const podeReusarOutra = acumulaveis.some((alvo) => {
      const militaresQueOcuparam = militarPorFuncao.get(alvo) ?? [];
      return militaresQueOcuparam.length > 0;
    });
    if (podeReusarOutra) continue;

    erros.push(
      `Recurso "${recurso.nome}" sem ${req.funcao} obrigatório (e sem ${
        (req.podeAcumularCom ?? []).join('/') || '—'
      } para acumular).`,
    );
  }

  return { ok: erros.length === 0, erros };
}

function normalizarFuncao(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Helper alias para uso externo (importações mais explícitas). */
export const RecursoCompositionValidator = {
  validar: validarComposicaoRecurso,
};

export type { FuncaoEquipeMinima };
