import { describe, it, expect, beforeEach } from 'vitest';
import { IdeoChecklistService } from './ideo-checklist.service';

describe('IdeoChecklistService (S5/F6c)', () => {
  let service: IdeoChecklistService;
  beforeEach(() => {
    service = new IdeoChecklistService();
  });

  it('mark cria nova entrada e list devolve', () => {
    service.mark(
      { data: '2026-04-23', tipo: 'ABTS', item: 'Mochila Costal', realizado: true },
      '3037509',
    );
    const all = service.list('2026-04-23');
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      data: '2026-04-23',
      tipo: 'ABTS',
      item: 'Mochila Costal',
      realizado: true,
      marcadoPorNf: '3037509',
    });
  });

  it('mark é idempotente: re-marcar atualiza', () => {
    service.mark({ data: '2026-04-23', tipo: 'ABTS', item: 'GPS', realizado: true });
    service.mark({ data: '2026-04-23', tipo: 'ABTS', item: 'GPS', realizado: false });
    const all = service.list('2026-04-23');
    expect(all).toHaveLength(1);
    expect(all[0]?.realizado).toBe(false);
  });

  it('list filtra por data', () => {
    service.mark({ data: '2026-04-23', tipo: 'ABTS', item: 'A', realizado: true });
    service.mark({ data: '2026-04-24', tipo: 'ABTS', item: 'B', realizado: true });
    expect(service.list('2026-04-23')).toHaveLength(1);
    expect(service.list('2026-04-24')).toHaveLength(1);
    expect(service.list('2026-04-25')).toHaveLength(0);
  });

  it('byTipo agrupa por item', () => {
    service.mark({ data: '2026-04-23', tipo: 'ABTS', item: 'GPS', realizado: true });
    service.mark({ data: '2026-04-23', tipo: 'ABTS', item: 'Mochila', realizado: false });
    service.mark({ data: '2026-04-23', tipo: 'RESGATE', item: 'Maca', realizado: true });
    const abts = service.byTipo('2026-04-23', 'ABTS');
    expect(abts.size).toBe(2);
    expect(abts.get('GPS')?.realizado).toBe(true);
    expect(abts.get('Mochila')?.realizado).toBe(false);
    const resgate = service.byTipo('2026-04-23', 'RESGATE');
    expect(resgate.size).toBe(1);
  });

  it('reset apaga marcações de uma data sem afetar outras', () => {
    service.mark({ data: '2026-04-23', tipo: 'ABTS', item: 'X', realizado: true });
    service.mark({ data: '2026-04-24', tipo: 'ABTS', item: 'Y', realizado: true });
    expect(service.reset('2026-04-23')).toBe(1);
    expect(service.list('2026-04-23')).toHaveLength(0);
    expect(service.list('2026-04-24')).toHaveLength(1);
  });
});
