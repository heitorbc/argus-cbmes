import ExcelJS from 'exceljs';
import {
  type ComposicaoEntry,
  type EquipeMergulho,
  type EscalaMensal,
  type EscalaMergulhoMes,
  type LetraEquipeMergulho,
  LETRA_EQUIPE_MERGULHO,
  type LetraEquipeRotativa,
  LETRA_EQUIPE_ROTATIVA,
  type MilitarRef,
} from '@argus/shared-types';

/**
 * Erro de parse — distingue rejeições "esperadas" (não-escala) de erros de runtime.
 */
export class EscalaXlsxParseError extends Error {
  constructor(
    message: string,
    readonly code: 'NOME_INVALIDO' | 'ABAS_AUSENTES' | 'LAYOUT_INVALIDO' | 'ARQUIVO_CORROMPIDO',
  ) {
    super(message);
    this.name = 'EscalaXlsxParseError';
  }
}

const MES_PT_TO_NUM: Record<string, number> = {
  JAN: 1,
  JANEIRO: 1,
  FEV: 2,
  FEVEREIRO: 2,
  MAR: 3,
  MARCO: 3,
  MARÇO: 3,
  ABR: 4,
  ABRIL: 4,
  MAI: 5,
  MAIO: 5,
  JUN: 6,
  JUNHO: 6,
  JUL: 7,
  JULHO: 7,
  AGO: 8,
  AGOSTO: 8,
  SET: 9,
  SETEMBRO: 9,
  OUT: 10,
  OUTUBRO: 10,
  NOV: 11,
  NOVEMBRO: 11,
  DEZ: 12,
  DEZEMBRO: 12,
};

const MES_NUM_TO_FULL = [
  '',
  'JANEIRO',
  'FEVEREIRO',
  'MARCO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
];

/**
 * Identifica mês/ano a partir do nome do arquivo. Aceita "MM MES DE AAAA.xlsx" e variantes.
 * Ex.: "05 MAIO DE 2026.xlsx", "02 FEVEREIRO DE 2026 - apos mergulho voltar.xlsx",
 * "05 MAIO DE 2026 11 A 15.xlsx" → todos retornam {mes:5, ano:2026}.
 */
export function parseFilename(filename: string): { mes: number; ano: number } {
  const norm = filename.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const matchAno = norm.match(/(20\d{2})/);
  if (!matchAno) {
    throw new EscalaXlsxParseError(
      `Nome do arquivo "${filename}" não contém ano. Esperado formato "MM MES DE AAAA.xlsx".`,
      'NOME_INVALIDO',
    );
  }
  const ano = Number.parseInt(matchAno[1]!, 10);

  for (const [token, mes] of Object.entries(MES_PT_TO_NUM)) {
    const re = new RegExp(`\\b${token}\\b`);
    if (re.test(norm)) {
      return { mes, ano };
    }
  }
  throw new EscalaXlsxParseError(
    `Nome do arquivo "${filename}" não contém nome de mês reconhecível.`,
    'NOME_INVALIDO',
  );
}

/**
 * Identifica as duas abas mensais relevantes (1ª quinzena e 2ª quinzena).
 * Aceita variações: "01 A 14 MAI", "01 A 13 JUN", "15 A 29 MAI", "15 A 31 JUL", etc.
 */
function findAbasMensais(wb: ExcelJS.Workbook): {
  aba1: ExcelJS.Worksheet;
  aba2: ExcelJS.Worksheet;
} {
  const norm = (s: string) =>
    s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  let aba1: ExcelJS.Worksheet | null = null;
  let aba2: ExcelJS.Worksheet | null = null;

  for (const ws of wb.worksheets) {
    const n = norm(ws.name);
    // Primeira quinzena: "01 A 13/14 MES"
    if (/^0?1\s*A\s*1[34]\b/.test(n)) {
      aba1 = aba1 ?? ws;
      continue;
    }
    // Segunda quinzena: "15/14 A 29/30/31 MES"
    if (/^1[45]\s*A\s*(?:29|30|31)\b/.test(n)) {
      aba2 = aba2 ?? ws;
    }
  }

  if (!aba1 || !aba2) {
    const found = wb.worksheets.map((w) => `"${w.name}"`).join(', ');
    throw new EscalaXlsxParseError(
      `Abas mensais não encontradas. Esperado uma aba "01 A 14 [MES]" e outra "15 A 29/30/31 [MES]". Encontradas: ${found}.`,
      'ABAS_AUSENTES',
    );
  }
  return { aba1, aba2 };
}

/** Extrai texto plano de uma célula ExcelJS (suporta richText, hyperlink, fórmulas com result). */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) {
    // YYYY-MM-DD em UTC-0 (que é como exceljs decodifica datas do XLSX).
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'object') {
    // ExcelJS rich text
    if ('richText' in v && Array.isArray((v as { richText: { text: string }[] }).richText)) {
      return (v as { richText: { text: string }[] }).richText
        .map((r) => r.text)
        .join('')
        .trim();
    }
    // formula com resultado
    if (
      'result' in v &&
      (v as { result: unknown }).result !== null &&
      (v as { result: unknown }).result !== undefined
    ) {
      const r = (v as { result: unknown }).result;
      if (typeof r === 'string') return r.trim();
      if (typeof r === 'number') return String(r);
      if (r instanceof Date) return r.toISOString().slice(0, 10);
    }
    if ('text' in v && typeof (v as { text: unknown }).text === 'string') {
      return (v as { text: string }).text.trim();
    }
    if ('hyperlink' in v && 'text' in v) {
      return String((v as { text: unknown }).text ?? '').trim();
    }
  }
  return String(v).trim();
}

/** Extrai dia (1-31) de uma célula que pode ser Date, número ou string. */
function cellAsDayOfMonth(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    // ExcelJS retorna em UTC; getUTCDate evita off-by-one.
    return v.getUTCDate();
  }
  if (typeof v === 'object' && 'result' in v) {
    const r = (v as { result: unknown }).result;
    if (r instanceof Date) return r.getUTCDate();
    if (typeof r === 'number' && Number.isFinite(r) && r >= 1 && r <= 31) return Math.floor(r);
    if (typeof r === 'string') {
      // S0.3 — algumas células R10 do XLSX trazem o resultado como ISO
      // datetime ("2026-01-15T00:00:00.000Z"). Extrai o dia daí.
      const iso = /^\d{4}-\d{2}-(\d{2})T/.exec(r);
      if (iso) {
        const n = Number.parseInt(iso[1]!, 10);
        if (n >= 1 && n <= 31) return n;
      }
      const n = Number.parseInt(r, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 31) return n;
    }
  }
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 31) return Math.floor(v);
  if (typeof v === 'string') {
    const m = v.match(/(\d{1,2})/);
    if (m) {
      const n = Number.parseInt(m[1]!, 10);
      if (n >= 1 && n <= 31) return n;
    }
  }
  return null;
}

/**
 * Localiza a linha com header de equipes ("EQUIPE A"/"EQUIPE B"/"EQUIPE C"/"EQUIPE D")
 * e devolve o mapa equipe→colunaInicial. Cada equipe ocupa 4 colunas redundantes a partir
 * dessa coluna.
 */
function findEquipeColumns(
  ws: ExcelJS.Worksheet,
  rowIdx: number,
): Map<LetraEquipeRotativa, number> {
  const result = new Map<LetraEquipeRotativa, number>();
  const row = ws.getRow(rowIdx);
  const last = Math.min(ws.columnCount, 30);
  for (let c = 1; c <= last; c++) {
    const txt = cellText(row.getCell(c)).toUpperCase();
    const m = txt.match(/EQUIPE\s+([ABCD])\b/);
    if (m && !result.has(m[1] as LetraEquipeRotativa)) {
      result.set(m[1] as LetraEquipeRotativa, c);
    }
  }
  return result;
}

/**
 * Extrai mapa "diaDoMes → letraEquipe" de uma aba.
 * Estrutura observada: linhas 9 ou 10 contêm as datas (dia do mês ou Date completo);
 * linhas 12 ou 13 contêm a letra da equipe escalada.
 */
function extractDiaEquipe(
  ws: ExcelJS.Worksheet,
  startCol: number,
  endCol: number,
  ano: number,
  mes: number,
): { diaEquipe: Record<string, LetraEquipeRotativa>; avisos: string[] } {
  const avisos: string[] = [];
  const diaEquipe: Record<string, LetraEquipeRotativa> = {};

  // Tenta extrair dias das linhas 9 ou 10 (fallback).
  const dias: (number | null)[] = [];
  const rowDias = [9, 10];
  for (let c = startCol; c <= endCol; c++) {
    let dia: number | null = null;
    for (const r of rowDias) {
      dia = cellAsDayOfMonth(ws.getRow(r).getCell(c));
      if (dia !== null) break;
    }
    dias.push(dia);
  }

  // Equipes nas linhas 12 ou 13.
  const equipes: (LetraEquipeRotativa | null)[] = [];
  const rowEquipes = [12, 13];
  for (let c = startCol; c <= endCol; c++) {
    let eq: LetraEquipeRotativa | null = null;
    for (const r of rowEquipes) {
      const txt = cellText(ws.getRow(r).getCell(c)).toUpperCase().trim();
      if (LETRA_EQUIPE_ROTATIVA.includes(txt as LetraEquipeRotativa)) {
        eq = txt as LetraEquipeRotativa;
        break;
      }
    }
    equipes.push(eq);
  }

  for (let i = 0; i < dias.length; i++) {
    const dia = dias[i];
    const eq = equipes[i];
    if (dia === null || eq === null) continue;
    const data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    if (diaEquipe[data] && diaEquipe[data] !== eq) {
      avisos.push(
        `Conflito de equipe para ${data}: já mapeada como ${diaEquipe[data]}, encontrada também como ${eq}.`,
      );
      continue;
    }
    diaEquipe[data] = eq;
  }

  return { diaEquipe, avisos };
}

/** Normaliza posto+nome em uma célula do tipo "2º SGT JULIO" → { posto: "2ºSGT", nome: "JULIO" }. */
export function parseMilitarCell(raw: string): MilitarRef | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '--' || trimmed === '-') return null;

  const cleaned = trimmed
    .replace(/\s+/g, ' ')
    .replace(/\bDE\b/, 'DE')
    .trim();

  // Padrões: "2º SGT JULIO", "1º SGT HEVERTON", "CB FABRE", "SD MARTINELLI", "TEN QOC VASSEM".
  const re =
    /^(?<posto>(?:[1-3]º\s*)?(?:CEL|TEN\s*CEL|MAJ|CAP|TEN(?:\s+QOC)?|SUB\s*TEN|SGT|CB|SD|AL))\s+(?<nome>.+)$/i;
  const m = cleaned.match(re);
  if (!m || !m.groups) {
    // Fallback: assume tudo nome
    return { raw: trimmed, postoAbreviado: '', nomeGuerra: trimmed };
  }
  const posto = m.groups.posto.replace(/\s+/g, '').replace(/º/g, 'º').toUpperCase();
  const nome = m.groups.nome.trim().toUpperCase();
  return { raw: trimmed, postoAbreviado: posto, nomeGuerra: nome };
}

/**
 * Mapeia nome de recurso/funcao do XLSX para o nome canônico esperado pelo
 * `RecursosService.nomesValidos()` (S6n-fix). Os XLSX institucionais usam
 * notação abreviada que não bate 1:1 com os nomes canônicos do Mapa Força:
 *
 *  - `"ABTS 01"` → `"ABTS_01"` (mesma viatura, separador diferente)
 *  - `"RESGATE"` (singular) → `"RESGATE 01"` (default quando só há 1 recurso)
 *  - `"MOT CH OP"` (recurso=funcao) → recurso `"CHEFE DE OPERAÇÕES"` com
 *    funcao `"Mot"` — o militar listado é o motorista do CHOP. O Chefe
 *    em si vem da planilha externa (`ChefesOperacoesService`).
 *  - `"ATB e Plat."` → expande em **2 entries** (`ATB` + `PLATAFORMA`),
 *    ambos com funcao `"Mot"`. O mesmo militar acumula Chefe+Motorista
 *    em ambas as viaturas (MF preenche só Motorista).
 *
 * Retorna lista de `{viatura, funcao}` — quase sempre 1 par; só `ATB e Plat.`
 * devolve 2.
 */
export function expandViaturaFuncao(
  viaturaRaw: string,
  funcaoRaw: string,
): Array<{ viatura: string; funcao: string }> {
  const v = viaturaRaw.trim().toUpperCase().replace(/\s+/g, ' ');
  const f = funcaoRaw.trim();

  if (v === 'MOT CH OP') {
    return [{ viatura: 'CHEFE DE OPERAÇÕES', funcao: 'Mot' }];
  }

  if (v === 'ATB E PLAT.' || v === 'ATB E PLAT') {
    return [
      { viatura: 'ATB', funcao: 'Mot' },
      { viatura: 'PLATAFORMA', funcao: 'Mot' },
    ];
  }

  const aliasMap: Record<string, string> = {
    'ABTS 01': 'ABTS_01',
    'ABTS 02': 'ABTS_02',
    RESGATE: 'RESGATE 01',
  };
  const normalizedV = aliasMap[v] ?? viaturaRaw.trim();
  return [{ viatura: normalizedV, funcao: f }];
}

/**
 * Extrai entradas de composição de uma aba dada o mapa de equipes.
 * Linhas 16-31 normalmente — varremos até a linha onde col1 fica vazia E col2 fica vazia.
 */
function extractComposicao(
  ws: ExcelJS.Worksheet,
  equipeCols: Map<LetraEquipeRotativa, number>,
  rowStart: number,
  rowEnd: number,
): { entries: ComposicaoEntry[]; avisos: string[] } {
  const avisos: string[] = [];
  const entries: ComposicaoEntry[] = [];

  // Conta quantas vezes (equipe|viatura|funcao base) já apareceu — para renumerar
  // funções repetidas como "Sent. 1", "Sent. 2", "Sent. 3" ao invés de colapsar.
  // Reset quando viatura muda (carry-forward).
  const counters = new Map<string, number>();
  // Quando promovemos a primeira ocorrência para "funcao 1", precisamos lembrar o
  // entry original para reescrever sua funcao.
  const firstEntryByKey = new Map<string, ComposicaoEntry>();

  let viaturaCorrente = '';
  for (let r = rowStart; r <= rowEnd; r++) {
    const row = ws.getRow(r);
    const col1 = cellText(row.getCell(1));
    const col2 = cellText(row.getCell(2));

    if (col1) {
      if (col1 !== viaturaCorrente) counters.clear();
      viaturaCorrente = col1;
    }
    const viatura = viaturaCorrente;
    const funcao = col2;

    if (!viatura && !funcao) continue;
    if (!funcao) continue; // sem função, não é linha de composição

    // S6n-fix: expande recurso/funcao para forma canônica (ex.: "ABTS 01" →
    // "ABTS_01"; "ATB e Plat." → 2 entries). Veja `expandViaturaFuncao`.
    const expansoes = expandViaturaFuncao(viatura, funcao);

    for (const { viatura: viaturaCanonica, funcao: funcaoCanonica } of expansoes) {
      for (const [equipe, startCol] of equipeCols.entries()) {
        // Cada equipe tem 4 cols redundantes; pega a primeira não-vazia.
        let raw = '';
        for (let off = 0; off < 4; off++) {
          const v = cellText(row.getCell(startCol + off));
          if (v) {
            raw = v;
            break;
          }
        }
        if (!raw) continue;
        const militar = parseMilitarCell(raw);
        if (!militar) {
          avisos.push(
            `Linha ${r}, equipe ${equipe}, ${viaturaCanonica}/${funcaoCanonica}: célula "${raw}" não reconhecida como militar.`,
          );
          continue;
        }
        const baseKey = `${equipe}|${viaturaCanonica}|${funcaoCanonica}`;
        const first = firstEntryByKey.get(baseKey);

        // S6n-fix: dedup quando a mesma militar aparece duplicado para
        // mesma slot (caso comum em "ATB e Plat." que tem 2 rows R27/R28
        // referindo o mesmo militar). Skip silencioso.
        if (first && first.militar.raw === militar.raw) continue;

        const seen = counters.get(baseKey) ?? 0;
        let funcaoFinal = funcaoCanonica;
        if (seen === 0) {
          // primeira ocorrência: ainda usa o nome original; pode ser promovida depois.
        } else if (seen === 1) {
          // segunda ocorrência: renomeia o primeiro para "funcao 1" e este vira "funcao 2".
          if (first) first.funcao = `${funcaoCanonica} 1`;
          funcaoFinal = `${funcaoCanonica} 2`;
        } else {
          funcaoFinal = `${funcaoCanonica} ${seen + 1}`;
        }
        counters.set(baseKey, seen + 1);
        const entry: ComposicaoEntry = {
          equipe,
          viatura: viaturaCanonica,
          funcao: funcaoFinal,
          militar,
        };
        if (seen === 0) firstEntryByKey.set(baseKey, entry);
        entries.push(entry);
      }
    }
  }

  return { entries, avisos };
}

/**
 * Sprint 0.3 — Extrai a seção de Mergulho da aba.
 *
 *  - **Cadastro fixo** em X16:AI20 (cols 24-35, rows 16-20):
 *    - R16 = headers "EQUIPE A" / "EQUIPE B" / "EQUIPE C" (4 cols cada)
 *    - R17 = Chefe, R18 = Motorista, R19/R20 = Mergulhadores
 *  - **Schedule** em R12 (MERGULHO 01) e R13 (MERGULHO 02). Cada coluna
 *    de dia (mesmas usadas em `extractDiaEquipe`) contém código
 *    `A1`/`A2`/`B1`/`B2`/`C1`/`C2`. Os sufixos 1/2 indicam dia 1 ou
 *    dia 2 do plantão da equipe — mesmos militares; aqui só nos
 *    interessa a letra.
 *
 * Retorna `null` se a seção estiver vazia (XLSX sem seção de mergulho,
 * ex.: testes legados).
 */
function parseMergulhoSection(
  ws: ExcelJS.Worksheet,
  startCol: number,
  endCol: number,
  ano: number,
  mes: number,
): EscalaMergulhoMes | null {
  // Etapa A — cadastro (X16:AI20).
  // Coluna X = 24. Cada equipe ocupa 4 colunas redundantes.
  const cadastroPorLetra: Partial<Record<LetraEquipeMergulho, [number, number]>> = {
    A: [24, 27], // X-AA
    B: [28, 31], // AB-AE
    C: [32, 35], // AF-AI
  };

  const equipes: Partial<Record<LetraEquipeMergulho, EquipeMergulho>> = {};
  let cadastroVazio = true;

  for (const letra of LETRA_EQUIPE_MERGULHO) {
    const [colIni, colFim] = cadastroPorLetra[letra]!;
    const pickPrimeira = (row: number): MilitarRef | null => {
      for (let c = colIni; c <= colFim; c++) {
        const raw = cellText(ws.getRow(row).getCell(c));
        if (raw) {
          const m = parseMilitarCell(raw);
          if (m) return m;
        }
      }
      return null;
    };
    const chefe = pickPrimeira(17);
    const motorista = pickPrimeira(18);
    const m1 = pickPrimeira(19);
    const m2 = pickPrimeira(20);
    const mergulhadores: MilitarRef[] = [];
    if (m1) mergulhadores.push(m1);
    if (m2) mergulhadores.push(m2);

    if (chefe || motorista || mergulhadores.length > 0) cadastroVazio = false;

    equipes[letra] = { letra, chefe, motorista, mergulhadores };
  }

  if (cadastroVazio) return null;

  // Etapa B — schedule por dia (R12 = MERGULHO 01, R13 = MERGULHO 02).
  // Para cada coluna (startCol..endCol), descobrir o dia do mês via
  // linha 9 ou 10 (mesma lógica de extractDiaEquipe), e ler o código
  // em R12 e R13.
  const porDia: Record<
    string,
    { mergulho01?: LetraEquipeMergulho; mergulho02?: LetraEquipeMergulho }
  > = {};
  const codigoRegex = /^([ABC])[12]$/;
  const rowDias = [9, 10];

  for (let c = startCol; c <= endCol; c++) {
    let dia: number | null = null;
    for (const r of rowDias) {
      dia = cellAsDayOfMonth(ws.getRow(r).getCell(c));
      if (dia !== null) break;
    }
    if (dia === null) continue;

    const dataIso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const cod12 = cellText(ws.getRow(12).getCell(c)).trim().toUpperCase();
    const cod13 = cellText(ws.getRow(13).getCell(c)).trim().toUpperCase();
    const m12 = codigoRegex.exec(cod12);
    const m13 = codigoRegex.exec(cod13);
    if (!m12 && !m13) continue;
    if (!porDia[dataIso]) porDia[dataIso] = {};
    if (m12) porDia[dataIso].mergulho01 = m12[1] as LetraEquipeMergulho;
    if (m13) porDia[dataIso].mergulho02 = m13[1] as LetraEquipeMergulho;
  }

  return {
    equipes: equipes as EscalaMergulhoMes['equipes'],
    porDia,
  };
}

/**
 * Heurística para extrair a aba inteira: identifica linhas das equipes (header EQUIPE X),
 * extrai o range de dias no header, identifica colunas de cada equipe e itera linhas 16-31.
 */
function parseAba(
  ws: ExcelJS.Worksheet,
  ano: number,
  mes: number,
): {
  diaEquipe: Record<string, LetraEquipeRotativa>;
  composicao: ComposicaoEntry[];
  mergulho: EscalaMergulhoMes | null;
  avisos: string[];
} {
  const avisos: string[] = [];

  // Encontrar linha do header EQUIPE A/B/C/D (esperado linha 15).
  let headerRow = 15;
  let equipeCols = findEquipeColumns(ws, headerRow);
  if (equipeCols.size < 4) {
    for (let r = 13; r <= 18; r++) {
      const cols = findEquipeColumns(ws, r);
      if (cols.size > equipeCols.size) {
        equipeCols = cols;
        headerRow = r;
      }
    }
  }
  if (equipeCols.size < 4) {
    throw new EscalaXlsxParseError(
      `Aba "${ws.name}": header de equipes (EQUIPE A/B/C/D) não encontrado nas linhas 13-18.`,
      'LAYOUT_INVALIDO',
    );
  }

  // Detectar range de colunas de equipes.
  const colsList = [...equipeCols.values()].sort((a, b) => a - b);
  const startCol = colsList[0]!;
  const endCol = colsList[colsList.length - 1]! + 3; // última equipe ocupa +3

  const { diaEquipe, avisos: avisosDia } = extractDiaEquipe(ws, startCol, endCol, ano, mes);
  avisos.push(...avisosDia);

  const { entries, avisos: avisosComp } = extractComposicao(
    ws,
    equipeCols,
    headerRow + 1,
    headerRow + 17, // até ~linha 32; abaixo é seção de férias
  );
  avisos.push(...avisosComp);

  // S0.3 — Mergulho (cadastro X16:AI20 + schedule R12/R13).
  // Range fixo cols W (23) .. AJ (36) — independente do range das equipes
  // rotativas (cols B-S).
  const mergulho = parseMergulhoSection(ws, 23, 36, ano, mes);

  return { diaEquipe, composicao: entries, mergulho, avisos };
}

/**
 * Mescla composições das duas abas. Composição é constante por equipe×viatura×função
 * dentro do mesmo mês — se as duas abas divergirem, mantém a primeira e registra aviso.
 */
function mergeComposicao(
  a: ComposicaoEntry[],
  b: ComposicaoEntry[],
  avisos: string[],
): ComposicaoEntry[] {
  const map = new Map<string, ComposicaoEntry>();
  const key = (e: ComposicaoEntry) => `${e.equipe}|${e.viatura}|${e.funcao}`;
  for (const entry of a) map.set(key(entry), entry);
  for (const entry of b) {
    const k = key(entry);
    const existing = map.get(k);
    if (!existing) {
      map.set(k, entry);
    } else if (existing.militar.raw !== entry.militar.raw) {
      avisos.push(
        `Composição diverge entre quinzenas para ${entry.equipe}/${entry.viatura}/${entry.funcao}: 1ª quinzena "${existing.militar.raw}", 2ª quinzena "${entry.militar.raw}". Mantendo 1ª quinzena.`,
      );
    }
  }
  return [...map.values()].sort(
    (x, y) =>
      x.equipe.localeCompare(y.equipe) ||
      x.viatura.localeCompare(y.viatura) ||
      x.funcao.localeCompare(y.funcao),
  );
}

export interface ParseEscalaInput {
  /** Buffer do arquivo XLSX (do upload multipart). */
  buffer: Buffer;
  /** Nome original do arquivo, para validação e auditoria. */
  filename: string;
  /** NF de quem está importando. Opcional. */
  importadoPorNf?: string;
}

/**
 * Parser principal: recebe Buffer + filename e retorna a EscalaMensal estruturada.
 * Lança EscalaXlsxParseError em caso de rejeição.
 */
export async function parseEscalaXlsx(input: ParseEscalaInput): Promise<EscalaMensal> {
  const { mes, ano } = parseFilename(input.filename);

  const wb = new ExcelJS.Workbook();
  try {
    // ExcelJS aceita Buffer; cast contorna tipagem antiga (`Buffer<ArrayBuffer>` vs `Buffer<ArrayBufferLike>` no Node 20+).
    await wb.xlsx.load(input.buffer as unknown as ArrayBuffer);
  } catch (err) {
    throw new EscalaXlsxParseError(
      `Não foi possível ler o XLSX (${err instanceof Error ? err.message : 'erro desconhecido'}).`,
      'ARQUIVO_CORROMPIDO',
    );
  }

  const { aba1, aba2 } = findAbasMensais(wb);
  const avisos: string[] = [];

  const r1 = parseAba(aba1, ano, mes);
  avisos.push(...r1.avisos.map((m) => `[${aba1.name}] ${m}`));
  const r2 = parseAba(aba2, ano, mes);
  avisos.push(...r2.avisos.map((m) => `[${aba2.name}] ${m}`));

  const diaEquipe = { ...r1.diaEquipe, ...r2.diaEquipe };
  const composicao = mergeComposicao(r1.composicao, r2.composicao, avisos);
  const mergulho = mergeMergulho(r1.mergulho, r2.mergulho);

  if (Object.keys(diaEquipe).length === 0) {
    throw new EscalaXlsxParseError(
      'Nenhum mapeamento dia→equipe foi encontrado. Layout do XLSX provavelmente mudou.',
      'LAYOUT_INVALIDO',
    );
  }
  if (composicao.length === 0) {
    throw new EscalaXlsxParseError(
      'Nenhuma composição de equipe foi encontrada.',
      'LAYOUT_INVALIDO',
    );
  }

  return {
    mes,
    ano,
    origemArquivo: input.filename,
    importadoEm: new Date().toISOString(),
    importadoPorNf: input.importadoPorNf,
    diaEquipe,
    composicao,
    mergulho: mergulho ?? undefined,
    avisos,
  };
}

/**
 * Mescla a seção de mergulho entre as 2 quinzenas. Cadastro fixo da
 * primeira quinzena vence; `porDia` acumula (datas distintas).
 */
function mergeMergulho(
  a: EscalaMergulhoMes | null,
  b: EscalaMergulhoMes | null,
): EscalaMergulhoMes | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return {
    equipes: a.equipes, // 1ª quinzena vence — cadastro é imutável no mês
    porDia: { ...a.porDia, ...b.porDia },
  };
}

/** Helper para tests: nome canônico de arquivo a partir de mês/ano. */
export function canonicalFilename(mes: number, ano: number): string {
  return `${String(mes).padStart(2, '0')} ${MES_NUM_TO_FULL[mes]} DE ${ano}.xlsx`;
}
