import { describe, it, expect, beforeEach } from 'vitest';
import { IdeoStatusService } from './ideo-status.service';

const data = '2026-05-09';
const chefeNf = '3037509';

describe('IdeoStatusService (S6i + S0.x — 4 estados)', () => {
  let svc: IdeoStatusService;

  beforeEach(() => {
    svc = new IdeoStatusService();
  });

  it('upsert REALIZADA_SEM_ALTERACAO cria entry com timestamp', () => {
    const r = svc.upsert(data, { tipo: 'ABTS', estado: 'REALIZADA_SEM_ALTERACAO' }, chefeNf);
    expect(r.tipo).toBe('ABTS');
    expect(r.estado).toBe('REALIZADA_SEM_ALTERACAO');
    expect(r.atestadoPorNf).toBe(chefeNf);
    expect(r.geradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.equipamentos).toEqual([]);
    expect(r.motivoNaoRealizacao).toBeUndefined();
  });

  it('upsert NAO_REALIZADA persiste motivo', () => {
    const r = svc.upsert(
      data,
      {
        tipo: 'RESGATE',
        estado: 'NAO_REALIZADA',
        motivoNaoRealizacao: 'Viatura BAIXADA',
      },
      chefeNf,
    );
    expect(r.estado).toBe('NAO_REALIZADA');
    expect(r.motivoNaoRealizacao).toBe('Viatura BAIXADA');
    expect(r.equipamentos).toEqual([]);
  });

  it('upsert REALIZADA_COM_ALTERACAO persiste equipamentos', () => {
    const r = svc.upsert(
      data,
      {
        tipo: 'ABTS',
        estado: 'REALIZADA_COM_ALTERACAO',
        equipamentos: [
          { item: 'Mochila Costal', descricao: 'lacre rompido' },
          { item: 'GPS', descricao: 'bateria fraca' },
        ],
      },
      chefeNf,
    );
    expect(r.estado).toBe('REALIZADA_COM_ALTERACAO');
    expect(r.equipamentos).toHaveLength(2);
    expect(r.equipamentos[0]?.item).toBe('Mochila Costal');
    expect(r.motivoNaoRealizacao).toBeUndefined();
  });

  it('upsert REALIZADA_SEM_ALTERACAO zera equipamentos mesmo se enviados', () => {
    const r = svc.upsert(
      data,
      {
        tipo: 'ABTS',
        estado: 'REALIZADA_SEM_ALTERACAO',
        equipamentos: [{ item: 'X', descricao: 'lixo' }],
      },
      chefeNf,
    );
    expect(r.equipamentos).toEqual([]);
  });

  it('getByData retorna apenas entries da data', () => {
    svc.upsert(data, { tipo: 'ABTS', estado: 'REALIZADA_SEM_ALTERACAO' }, chefeNf);
    svc.upsert('2026-05-10', { tipo: 'ABTS', estado: 'REALIZADA_SEM_ALTERACAO' }, chefeNf);
    expect(svc.getByData(data)).toHaveLength(1);
    expect(svc.getByData('2026-05-10')).toHaveLength(1);
  });

  it('upsert mesmo tipo substitui (idempotente por dia/tipo)', () => {
    svc.upsert(data, { tipo: 'ABTS', estado: 'REALIZADA_SEM_ALTERACAO' }, chefeNf);
    svc.upsert(
      data,
      { tipo: 'ABTS', estado: 'NAO_REALIZADA', motivoNaoRealizacao: 'Equipamento faltando' },
      chefeNf,
    );
    const all = svc.getByData(data);
    expect(all).toHaveLength(1);
    expect(all[0]?.estado).toBe('NAO_REALIZADA');
    expect(all[0]?.motivoNaoRealizacao).toBe('Equipamento faltando');
  });

  it('reset(data) limpa só aquela data', () => {
    svc.upsert(data, { tipo: 'ABTS', estado: 'REALIZADA_SEM_ALTERACAO' }, chefeNf);
    svc.upsert('2026-05-10', { tipo: 'ABTS', estado: 'REALIZADA_SEM_ALTERACAO' }, chefeNf);
    svc.reset(data);
    expect(svc.getByData(data)).toHaveLength(0);
    expect(svc.getByData('2026-05-10')).toHaveLength(1);
  });
});
