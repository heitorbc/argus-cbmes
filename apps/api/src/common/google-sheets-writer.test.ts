import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  decodeServiceAccountKey,
  createSheetIfMissing,
  listSheets,
  readAll,
  clearAndWrite,
  upsertByKey,
} from './google-sheets-writer';
import type { sheets_v4 } from 'googleapis';

// ── Mock helpers ─────────────────────────────────────────────────

interface MockClient {
  spreadsheets: {
    get: ReturnType<typeof vi.fn>;
    batchUpdate: ReturnType<typeof vi.fn>;
    values: {
      get: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      clear: ReturnType<typeof vi.fn>;
    };
  };
}

function makeClient(initialSheets: Record<string, string[][]> = {}): MockClient {
  const data = new Map(Object.entries(initialSheets));
  return {
    spreadsheets: {
      get: vi.fn(async () => ({
        data: { sheets: [...data.keys()].map((title) => ({ properties: { title } })) },
      })),
      batchUpdate: vi.fn(
        async (req: {
          requestBody: { requests: Array<{ addSheet?: { properties?: { title?: string } } }> };
        }) => {
          for (const r of req.requestBody.requests) {
            const title = r.addSheet?.properties?.title;
            if (title && !data.has(title)) data.set(title, []);
          }
          return { data: {} };
        },
      ),
      values: {
        get: vi.fn(async (req: { range: string }) => {
          const sheetName = req.range.split('!')[0]!;
          return { data: { values: data.get(sheetName) ?? [] } };
        }),
        update: vi.fn(async (req: { range: string; requestBody: { values: string[][] } }) => {
          const sheetName = req.range.split('!')[0]!;
          const cellRef = req.range.split('!')[1] ?? 'A1';
          const startRow = Number.parseInt(cellRef.match(/\d+/)?.[0] ?? '1', 10) - 1;
          const existing = data.get(sheetName) ?? [];
          const merged = [...existing];
          for (let i = 0; i < req.requestBody.values.length; i++) {
            merged[startRow + i] = req.requestBody.values[i]!;
          }
          data.set(sheetName, merged);
          return { data: {} };
        }),
        clear: vi.fn(async (req: { range: string }) => {
          const sheetName = req.range.split('!')[0]!;
          const existing = data.get(sheetName) ?? [];
          // Limpa de A2 em diante (preserva header).
          data.set(sheetName, existing.length > 0 ? [existing[0]!] : []);
          return { data: {} };
        }),
      },
    },
  };
}

describe('decodeServiceAccountKey', () => {
  it('aceita JSON puro (não-base64)', () => {
    const json = JSON.stringify({
      client_email: 'sa@x.iam',
      private_key: '-----BEGIN PRIVATE KEY-----\n...',
    });
    const key = decodeServiceAccountKey(json);
    expect(key.client_email).toBe('sa@x.iam');
  });

  it('aceita base64', () => {
    const json = JSON.stringify({ client_email: 'sa@x.iam', private_key: 'k' });
    const b64 = Buffer.from(json).toString('base64');
    const key = decodeServiceAccountKey(b64);
    expect(key.client_email).toBe('sa@x.iam');
  });

  it('lança erro se vazio', () => {
    expect(() => decodeServiceAccountKey('')).toThrow(/vazio/);
  });

  it('lança erro se faltam campos obrigatórios', () => {
    expect(() => decodeServiceAccountKey('{"foo":"bar"}')).toThrow(/client_email ou private_key/);
  });
});

describe('listSheets / createSheetIfMissing', () => {
  let client: MockClient;
  beforeEach(() => {
    client = makeClient({ existente: [['header']] });
  });

  it('listSheets retorna nomes', async () => {
    const sheets = await listSheets(client as unknown as sheets_v4.Sheets, 'sid');
    expect(sheets).toEqual(['existente']);
  });

  it('createSheetIfMissing CRIA se não existe', async () => {
    const result = await createSheetIfMissing(
      client as unknown as sheets_v4.Sheets,
      'sid',
      'nova',
      ['col1', 'col2'],
    );
    expect(result.created).toBe(true);
    expect(client.spreadsheets.batchUpdate).toHaveBeenCalled();
    expect(client.spreadsheets.values.update).toHaveBeenCalledWith(
      expect.objectContaining({
        range: 'nova!A1',
        requestBody: { values: [['col1', 'col2']] },
      }),
    );
  });

  it('createSheetIfMissing é idempotente — não recria existente', async () => {
    const result = await createSheetIfMissing(
      client as unknown as sheets_v4.Sheets,
      'sid',
      'existente',
      ['header'],
    );
    expect(result.created).toBe(false);
    expect(client.spreadsheets.batchUpdate).not.toHaveBeenCalled();
  });
});

describe('readAll / clearAndWrite', () => {
  it('readAll retorna todas as linhas (incluindo header)', async () => {
    const client = makeClient({
      tabela: [
        ['col1', 'col2'],
        ['v1', 'v2'],
        ['v3', 'v4'],
      ],
    });
    const rows = await readAll(client as unknown as sheets_v4.Sheets, 'sid', 'tabela');
    expect(rows.length).toBe(3);
    expect(rows[1]).toEqual(['v1', 'v2']);
  });

  it('clearAndWrite limpa A2+ e escreve novas linhas', async () => {
    const client = makeClient({
      tabela: [['col1'], ['old1'], ['old2']],
    });
    await clearAndWrite(client as unknown as sheets_v4.Sheets, 'sid', 'tabela', [
      ['novo1'],
      ['novo2'],
      ['novo3'],
    ]);
    const after = await readAll(client as unknown as sheets_v4.Sheets, 'sid', 'tabela');
    expect(after).toEqual([['col1'], ['novo1'], ['novo2'], ['novo3']]);
  });

  it('clearAndWrite com array vazio só limpa', async () => {
    const client = makeClient({ tabela: [['col1'], ['old']] });
    await clearAndWrite(client as unknown as sheets_v4.Sheets, 'sid', 'tabela', []);
    const after = await readAll(client as unknown as sheets_v4.Sheets, 'sid', 'tabela');
    expect(after).toEqual([['col1']]);
  });
});

describe('upsertByKey', () => {
  it('substitui linha existente pela mesma chave', async () => {
    const client = makeClient({
      tabela: [
        ['id', 'val'],
        ['1', 'old'],
        ['2', 'keep'],
      ],
    });
    await upsertByKey(client as unknown as sheets_v4.Sheets, 'sid', 'tabela', 0, [['1', 'new']]);
    const after = await readAll(client as unknown as sheets_v4.Sheets, 'sid', 'tabela');
    // Linha 0 = header, depois as data merged
    expect(after[0]).toEqual(['id', 'val']);
    const dataRows = after.slice(1).sort((a, b) => a[0]!.localeCompare(b[0]!));
    expect(dataRows).toEqual([
      ['1', 'new'],
      ['2', 'keep'],
    ]);
  });

  it('apenda nova chave sem afetar existentes', async () => {
    const client = makeClient({
      tabela: [
        ['id', 'val'],
        ['1', 'a'],
      ],
    });
    await upsertByKey(client as unknown as sheets_v4.Sheets, 'sid', 'tabela', 0, [
      ['2', 'b'],
      ['3', 'c'],
    ]);
    const after = await readAll(client as unknown as sheets_v4.Sheets, 'sid', 'tabela');
    expect(after.length).toBe(4);
  });

  it('lança erro se aba está vazia (sem header)', async () => {
    const client = makeClient({ tabela: [] });
    await expect(
      upsertByKey(client as unknown as sheets_v4.Sheets, 'sid', 'tabela', 0, [['1']]),
    ).rejects.toThrow(/Aba.*vazia/);
  });
});
