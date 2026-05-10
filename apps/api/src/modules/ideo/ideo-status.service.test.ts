import { describe, it, expect, beforeEach } from 'vitest';
import { IdeoStatusService } from './ideo-status.service';

const data = '2026-05-09';
const fiscalNf = '3037509';

describe('IdeoStatusService (S6i)', () => {
  let svc: IdeoStatusService;

  beforeEach(() => {
    svc = new IdeoStatusService();
  });

  it('upsert ABTS realizada cria entry com timestamp', () => {
    const r = svc.upsert(data, { tipo: 'ABTS', realizada: true }, fiscalNf);
    expect(r.tipo).toBe('ABTS');
    expect(r.realizada).toBe(true);
    expect(r.fiscalNf).toBe(fiscalNf);
    expect(r.geradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.motivoNaoRealizacao).toBeUndefined();
  });

  it('upsert não-realizada persiste motivo', () => {
    const r = svc.upsert(
      data,
      { tipo: 'RESGATE', realizada: false, motivoNaoRealizacao: 'Viatura BAIXADA' },
      fiscalNf,
    );
    expect(r.realizada).toBe(false);
    expect(r.motivoNaoRealizacao).toBe('Viatura BAIXADA');
  });

  it('upsert realizada=true zera motivoNaoRealizacao mesmo se enviado', () => {
    const r = svc.upsert(
      data,
      { tipo: 'ABTS', realizada: true, motivoNaoRealizacao: 'lixo' },
      fiscalNf,
    );
    expect(r.motivoNaoRealizacao).toBeUndefined();
  });

  it('getByData retorna apenas entries da data', () => {
    svc.upsert(data, { tipo: 'ABTS', realizada: true }, fiscalNf);
    svc.upsert('2026-05-10', { tipo: 'ABTS', realizada: true }, fiscalNf);
    expect(svc.getByData(data)).toHaveLength(1);
    expect(svc.getByData('2026-05-10')).toHaveLength(1);
  });

  it('upsert mesmo tipo substitui (idempotente por dia/tipo)', () => {
    svc.upsert(data, { tipo: 'ABTS', realizada: true }, fiscalNf);
    svc.upsert(
      data,
      { tipo: 'ABTS', realizada: false, motivoNaoRealizacao: 'Equipamento faltando' },
      fiscalNf,
    );
    const all = svc.getByData(data);
    expect(all).toHaveLength(1);
    expect(all[0]?.realizada).toBe(false);
    expect(all[0]?.motivoNaoRealizacao).toBe('Equipamento faltando');
  });

  it('reset(data) limpa só aquela data', () => {
    svc.upsert(data, { tipo: 'ABTS', realizada: true }, fiscalNf);
    svc.upsert('2026-05-10', { tipo: 'ABTS', realizada: true }, fiscalNf);
    svc.reset(data);
    expect(svc.getByData(data)).toHaveLength(0);
    expect(svc.getByData('2026-05-10')).toHaveLength(1);
  });
});
