import type {
  ContatoLogistico,
  ViaturaCbmes,
  ViaturaQdvBaseLista,
} from '@argus/shared-types';

/**
 * S0.5/3.1 — Parsers das 3 abas adicionais da planilha QDV:
 *
 *  - `BASE_LISTA` — cadastro mestre detalhado por OBM
 *  - `BASE_VTR_LISTA_PRINCIPAL` — TODAS as VTRs do CBMES
 *  - `Contatos_LOGISTICAS` — responsável logístico por OBM
 *
 * As 3 abas têm header simples na linha 0 (CSV padrão), diferente da
 * aba `1BBM_1CIA` (header na linha 2 com metadados de "ATUALIZADO EM"
 * + "RESPONSÁVEL" antes).
 */

export function parseQdvBaseListaCsv(csv: string): ViaturaQdvBaseLista[] {
  const rows = parseCsvRobust(csv);
  if (rows.length < 2) return [];
  const header = (rows[0] ?? []).map((c) => c.trim());
  const idx = (token: string): number => header.findIndex((h) => h.toUpperCase() === token.toUpperCase());

  const out: ViaturaQdvBaseLista[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cols = rows[r] ?? [];
    const get = (token: string): string | undefined => {
      const i = idx(token);
      if (i < 0) return undefined;
      const v = (cols[i] ?? '').trim();
      return v || undefined;
    };
    const prefixo = get('PREFIXO');
    if (!prefixo) continue;
    const kmText = get('KM ATUAL');
    const kmAtual = kmText ? Number(kmText.replace(/\./g, '').replace(/,/g, '')) : undefined;
    out.push({
      obm: get('OBM') ?? '',
      prefixo,
      nomenclatura: get('NOMENCLATURA'),
      ano: get('ANO'),
      status: get('STATUS'),
      emprestadaA: get('EMPRESTADA A:'),
      kmAtual: Number.isFinite(kmAtual) ? kmAtual : undefined,
      observacao: get('OBS'),
      empregoPrimario: get('Emprego Primário') ?? get('EMPREGO PRIMÁRIO'),
      empregoSecundario: get('Emprego Secundário') ?? get('EMPREGO SECUNDÁRIO'),
      placa: get('PLACA'),
      renavam: get('RENAVAM'),
      categoriaCnh: get('CATEGORIA DA CNH'),
      marcaModelo: get('MARCA / MODELO'),
      combustivel: get('TIPO DO COMBUSTÍVEL'),
      modeloPneu: get('MODELO DE PNEU'),
    });
  }
  return out;
}

export function parseVtrListaPrincipalCsv(csv: string): ViaturaCbmes[] {
  const rows = parseCsvRobust(csv);
  if (rows.length < 2) return [];
  const header = (rows[0] ?? []).map((c) => c.trim());
  const idx = (token: string): number => header.findIndex((h) => h.toUpperCase() === token.toUpperCase());

  const out: ViaturaCbmes[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cols = rows[r] ?? [];
    const get = (token: string): string | undefined => {
      const i = idx(token);
      if (i < 0) return undefined;
      const v = (cols[i] ?? '').trim();
      return v || undefined;
    };
    const prefixo = get('Prefixo');
    const prefixoUnderscore = get('Prefixo com _');
    if (!prefixo && !prefixoUnderscore) continue;
    out.push({
      obm: get('OBM') ?? '',
      prefixoComUnderscore: prefixoUnderscore ?? prefixo ?? '',
      prefixo: prefixo ?? prefixoUnderscore ?? '',
      nomenclatura: get('NOMECLATURA') ?? get('NOMENCLATURA'),
      ano: get('ANO'),
      idade: get('VTR IDADE'),
      observacao: get('OBS'),
      placa: get('PLACA'),
      renavam: get('RENAVAM'),
      categoriaCnh: get('CATEGORIA DE HABILITAÇÃO'),
      tipoVeiculo: get('TIPO VEÍCULO'),
      marcaModelo: get('MARCA / MODELO'),
      combustivel: get('TIPO DO COMBUSTÍVEL'),
      modeloPneu: get('MODELO DE PNEU'),
    });
  }
  return out;
}

export function parseContatosLogisticasCsv(csv: string): ContatoLogistico[] {
  const rows = parseCsvRobust(csv);
  if (rows.length < 2) return [];
  const header = (rows[0] ?? []).map((c) => c.trim());
  const idx = (token: string): number => header.findIndex((h) => h.toUpperCase() === token.toUpperCase());

  const out: ContatoLogistico[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cols = rows[r] ?? [];
    const get = (token: string): string | undefined => {
      const i = idx(token);
      if (i < 0) return undefined;
      const v = (cols[i] ?? '').trim();
      return v || undefined;
    };
    const nf = get('NF');
    const obm = get('OBM');
    if (!nf || !obm) continue;
    out.push({
      obm,
      nf,
      militarResponsavel: get('MILITAR RESPONSÁVEL') ?? '',
      nomeCompleto: get('NOME COMPLETO DO MILITAR'),
      telefone: get('TELEFONE CONTATO') ?? get('TELEFONE'),
      email: get('EMAIL'),
    });
  }
  return out;
}

function parseCsvRobust(csv: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < csv.length) {
    const ch = csv[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      row.push(field);
      out.push(row);
      row = [];
      field = '';
      if (ch === '\r' && csv[i + 1] === '\n') i += 2;
      else i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    out.push(row);
  }
  return out;
}
