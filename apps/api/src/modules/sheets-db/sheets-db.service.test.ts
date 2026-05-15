import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { SheetsDbService, SHEETS } from './sheets-db.service';

/**
 * Tests unitários SheetsDbService — usa o "modo desabilitado" para
 * validar a lógica sem mockar `googleapis`. Os tests do wrapper de
 * baixo nível (`google-sheets-writer.test.ts`) cobrem a comunicação
 * com a API.
 */

function makeConfig(overrides: Record<string, string | undefined> = {}): ConfigService {
  const map: Record<string, string | undefined> = { ...overrides };
  return {
    get: (key: string) => map[key],
  } as unknown as ConfigService;
}

describe('SheetsDbService — modo desabilitado (sem credenciais)', () => {
  let svc: SheetsDbService;

  beforeEach(() => {
    svc = new SheetsDbService(makeConfig());
  });

  it('isEnabled() = false sem env vars', async () => {
    await svc.onModuleInit();
    expect(svc.isEnabled()).toBe(false);
  });

  it('reads retornam array vazio quando desabilitado', async () => {
    await svc.onModuleInit();
    expect(await svc.readEscalaMensal()).toEqual([]);
    expect(await svc.readEscalaEspecial()).toEqual([]);
    expect(await svc.readNotasServico()).toEqual([]);
  });

  it('writes são no-op silencioso quando desabilitado', async () => {
    await svc.onModuleInit();
    // Não lança. Útil para o app rodar local sem GCP setup.
    await expect(
      svc.replaceEscalaMensalMes(2026, 5, [['linha']]),
    ).resolves.toBeUndefined();
    await expect(svc.upsertNotaServico(['linha'])).resolves.toBeUndefined();
    await expect(svc.deleteNotaServico('id1')).resolves.toBeUndefined();
  });

  it('getStatus() reporta enabled=false e abas com existe=false', async () => {
    await svc.onModuleInit();
    const status = svc.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.spreadsheetId).toBeNull();
    expect(status.bootstrappedAt).toBeNull();
    expect(status.abas.length).toBe(3);
    expect(status.abas.every((a) => !a.existe)).toBe(true);
  });

  it('bootstrap() lança ServiceUnavailable sem credenciais', async () => {
    // Não chamou onModuleInit → spreadsheetId/saKey continuam null.
    await expect(svc.bootstrap()).rejects.toThrow(/credenciais/);
  });
});

describe('SHEETS schema', () => {
  it('declara as 3 abas com nomes corretos', () => {
    expect(SHEETS.ESCALA_MENSAL.name).toBe('bd_escala_mensal');
    expect(SHEETS.ESCALA_ESPECIAL.name).toBe('bd_escala_especial');
    expect(SHEETS.NOTAS_SERVICO.name).toBe('bd_notas_servico');
  });

  it('cada aba tem headers com pelo menos 8 colunas', () => {
    for (const cfg of Object.values(SHEETS)) {
      expect(cfg.headers.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('keyColIdx aponta para coluna existente', () => {
    for (const cfg of Object.values(SHEETS)) {
      expect(cfg.keyColIdx).toBeGreaterThanOrEqual(0);
      expect(cfg.keyColIdx).toBeLessThan(cfg.headers.length);
    }
  });

  it('NotasServico usa id (col 0) como chave', () => {
    expect(SHEETS.NOTAS_SERVICO.headers[SHEETS.NOTAS_SERVICO.keyColIdx]).toBe('id');
  });
});
