import { describe, it, expect, beforeEach } from 'vitest';
import { IdeoService } from './ideo.service';

describe('IdeoService', () => {
  let service: IdeoService;
  beforeEach(() => {
    service = new IdeoService();
  });

  it('upsert + get', () => {
    const e = service.upsert(
      { dia: 23, tipo: 'ABTS', itens: ['Mochila Costal', 'GPS'] },
      '3037509',
    );
    expect(e.dia).toBe(23);
    expect(e.tipo).toBe('ABTS');
    expect(e.itens).toEqual(['Mochila Costal', 'GPS']);
    expect(e.atualizadoPorNf).toBe('3037509');

    const fetched = service.get(23, 'ABTS');
    expect(fetched).toEqual(e);
  });

  it('upsert sobrescreve entrada existente', () => {
    service.upsert({ dia: 1, tipo: 'RESGATE', itens: ['A'] });
    service.upsert({ dia: 1, tipo: 'RESGATE', itens: ['B', 'C'] });
    expect(service.get(1, 'RESGATE')?.itens).toEqual(['B', 'C']);
  });

  it('list retorna todas as entradas', () => {
    service.upsert({ dia: 1, tipo: 'ABTS', itens: ['x'] });
    service.upsert({ dia: 1, tipo: 'RESGATE', itens: ['y'] });
    service.upsert({ dia: 2, tipo: 'ABTS', itens: ['z'] });
    expect(service.list().entries).toHaveLength(3);
  });

  it('delete remove entrada', () => {
    service.upsert({ dia: 5, tipo: 'ABTS', itens: ['a'] });
    service.delete(5, 'ABTS');
    expect(service.get(5, 'ABTS')).toBeNull();
  });

  it('get retorna null para entrada inexistente', () => {
    expect(service.get(15, 'ABTS')).toBeNull();
  });
});
