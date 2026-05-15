import { Logger } from '@nestjs/common';
import { google, type sheets_v4 } from 'googleapis';

/**
 * Wrapper de baixo nível sobre a Google Sheets API v4.
 *
 * Auth via Service Account (chave JSON em base64 na env
 * `GOOGLE_SHEETS_SA_KEY_BASE64`). Padrão alinhado com a decisão do Tech
 * Lead: SA EXCLUSIVA para a planilha-DB do projeto. Mapa Força CIODES
 * e demais planilhas externas continuam por CSV público (read-only).
 *
 * O cliente é singleton — primeira chamada autentica; chamadas
 * subsequentes reusam a JWT autorizada (válida por 1h por padrão).
 *
 * Métodos públicos:
 *   - listSheets(spreadsheetId)
 *   - createSheetIfMissing(spreadsheetId, title, headers)
 *   - readAll(spreadsheetId, sheetName)
 *   - clearAndWrite(spreadsheetId, sheetName, rows) — atômico (clear + write)
 *   - upsertByKey(spreadsheetId, sheetName, keyColIdx, rows) — merge in-memory
 */

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

let cachedClient: sheets_v4.Sheets | null = null;
let cachedAuth: { keySource: string } | null = null;

const logger = new Logger('GoogleSheetsWriter');

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id?: string;
}

/**
 * Decodifica a chave SA em base64. Aceita tanto a chave JSON inteira
 * quanto JSON puro (sem encoding) — útil em dev quando o developer
 * exporta diretamente.
 */
export function decodeServiceAccountKey(raw: string): ServiceAccountKey {
  if (!raw || !raw.trim()) {
    throw new Error('GOOGLE_SHEETS_SA_KEY_BASE64 vazio.');
  }
  const trimmed = raw.trim();
  let json: string;
  if (trimmed.startsWith('{')) {
    json = trimmed;
  } else {
    try {
      json = Buffer.from(trimmed, 'base64').toString('utf8');
    } catch (err) {
      throw new Error(`GOOGLE_SHEETS_SA_KEY_BASE64 inválido: ${(err as Error).message}`, {
        cause: err,
      });
    }
  }
  let parsed: ServiceAccountKey;
  try {
    parsed = JSON.parse(json) as ServiceAccountKey;
  } catch (err) {
    throw new Error(
      `GOOGLE_SHEETS_SA_KEY_BASE64 não é JSON válido: ${(err as Error).message}`,
      { cause: err },
    );
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('SA key sem client_email ou private_key.');
  }
  return parsed;
}

/**
 * Retorna o cliente Sheets singleton, autenticando na primeira chamada.
 * Lança erro descritivo se a env var não está configurada.
 */
export async function getSheetsClient(saKeyBase64: string): Promise<sheets_v4.Sheets> {
  if (cachedClient && cachedAuth?.keySource === saKeyBase64) {
    return cachedClient;
  }
  const key = decodeServiceAccountKey(saKeyBase64);
  const jwt = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
  });
  await jwt.authorize();
  cachedClient = google.sheets({ version: 'v4', auth: jwt });
  cachedAuth = { keySource: saKeyBase64 };
  logger.log(`Sheets client autenticado como ${key.client_email}`);
  return cachedClient;
}

/** Apenas para tests — limpa o singleton entre runs. */
export function _resetSheetsClientCache(): void {
  cachedClient = null;
  cachedAuth = null;
}

/**
 * Lista os nomes das abas de uma planilha. Útil para verificar quais
 * existem antes de criar.
 */
export async function listSheets(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
): Promise<string[]> {
  const res = await client.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(title))',
  });
  return (res.data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => typeof t === 'string');
}

/**
 * Cria uma aba com cabeçalho se ela ainda não existe. Idempotente:
 * pode ser chamado a cada startup sem duplicar.
 */
export async function createSheetIfMissing(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  title: string,
  headers: string[],
): Promise<{ created: boolean }> {
  const existing = await listSheets(client, spreadsheetId);
  if (existing.includes(title)) {
    return { created: false };
  }
  // 1. Cria a aba.
  await client.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });
  // 2. Escreve o header na linha 1.
  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  });
  logger.log(`Aba "${title}" criada com ${headers.length} colunas.`);
  return { created: true };
}

/**
 * Lê todos os dados de uma aba (incluindo o cabeçalho na linha 1).
 * Retorna matriz de strings — caller decide o parsing.
 */
export async function readAll(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
): Promise<string[][]> {
  const res = await client.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
  });
  return (res.data.values ?? []) as string[][];
}

/**
 * Limpa todas as linhas de dados (preserva header na linha 1) e
 * escreve `rows` a partir da linha 2. Operação semi-atômica:
 * em caso de falha entre clear e write, a aba pode ficar vazia.
 *
 * Use quando o conjunto de dados é pequeno e re-escrever o todo é
 * mais simples que fazer diff.
 */
export async function clearAndWrite(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  rows: string[][],
): Promise<void> {
  await client.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A2:ZZ`,
  });
  if (rows.length === 0) return;
  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

/**
 * Upsert: lê todas as linhas, faz merge em-memória pelo valor da
 * coluna `keyColIdx` (chave), reescreve a aba inteira.
 *
 * Mais robusto que `clearAndWrite` para casos onde múltiplas chamadas
 * concorrentes podem competir — mas ainda assim NÃO é livre de race
 * condition (Sheets API não tem transações). Para o uso atual (1
 * instância de backend), é suficiente.
 *
 * `rows` deve incluir a chave na posição `keyColIdx`. Linhas existentes
 * com mesma chave são SOBRESCRITAS; novas chaves são APENDADAS.
 */
export async function upsertByKey(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  keyColIdx: number,
  rows: string[][],
): Promise<void> {
  if (rows.length === 0) return;
  const all = await readAll(client, spreadsheetId, sheetName);
  if (all.length === 0) {
    throw new Error(
      `Aba "${sheetName}" vazia (sem header). Rode bootstrap antes de upsert.`,
    );
  }
  const header = all[0]!;
  const data = all.slice(1);
  const byKey = new Map<string, string[]>();
  for (const row of data) {
    const key = row[keyColIdx] ?? '';
    if (key) byKey.set(key, row);
  }
  for (const row of rows) {
    const key = row[keyColIdx] ?? '';
    if (!key) continue;
    byKey.set(key, row);
  }
  const merged = [...byKey.values()];
  await clearAndWrite(client, spreadsheetId, sheetName, merged);
  logger.debug(
    `upsertByKey "${sheetName}": ${rows.length} entries → total ${merged.length}.`,
  );
  // Header não é modificado; mantido in-loco. (Apenas referência: ${header.length} colunas.)
  void header;
}
