import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { NotasServicoService } from './notas-servico.service';

const sargenteanteNf = '9999999';

describe('NotasServicoService (S6l)', () => {
  let svc: NotasServicoService;

  beforeEach(() => {
    svc = new NotasServicoService();
  });

  it('create gera id + timestamps + preserva campos', () => {
    const n = svc.create(
      {
        codigo: 'NS077',
        descricao: 'ISEO - Coleta leite materno',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        viaturaPrefixo: 'AR_044',
        militaresNfs: ['3037509', '3670180'],
        observacoes: 'Levar maca rígida',
      },
      sargenteanteNf,
    );
    expect(n.id).toMatch(/^ns:/);
    expect(n.criadoPorNf).toBe(sargenteanteNf);
    expect(n.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(n.codigo).toBe('NS077');
    expect(n.militaresNfs).toEqual(['3037509', '3670180']);
    expect(n.viaturaPrefixo).toBe('AR_044');
    expect(n.observacoes).toBe('Levar maca rígida');
  });

  it('createOrConflict rejeita duplicata exata (codigo, data)', () => {
    svc.create(
      {
        codigo: 'NS077',
        descricao: 'X',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509'],
      },
      sargenteanteNf,
    );
    expect(() =>
      svc.createOrConflict(
        {
          codigo: 'NS077',
          descricao: 'Y',
          data: '2026-05-10',
          horaInicio: '14:00',
          horaFim: '18:00',
          militaresNfs: ['3670180'],
        },
        sargenteanteNf,
      ),
    ).toThrow(ConflictException);
  });

  it('createOrConflict permite mesmo codigo em datas distintas', () => {
    svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509'],
      },
      sargenteanteNf,
    );
    const n2 = svc.createOrConflict(
      {
        codigo: 'NS001',
        descricao: 'Y',
        data: '2026-05-11',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3670180'],
      },
      sargenteanteNf,
    );
    expect(n2.codigo).toBe('NS001');
    expect(n2.data).toBe('2026-05-11');
  });

  it('list filtra por data', () => {
    svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509'],
      },
      sargenteanteNf,
    );
    svc.create(
      {
        codigo: 'NS002',
        descricao: 'Y',
        data: '2026-05-11',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509'],
      },
      sargenteanteNf,
    );
    expect(svc.list({ data: '2026-05-10' })).toHaveLength(1);
    expect(svc.list({ data: '2026-05-11' })).toHaveLength(1);
    expect(svc.list({})).toHaveLength(2);
  });

  it('list filtra por militarNf (NS que envolvem o militar)', () => {
    svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509', '3670180'],
      },
      sargenteanteNf,
    );
    svc.create(
      {
        codigo: 'NS002',
        descricao: 'Y',
        data: '2026-05-11',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3670180'],
      },
      sargenteanteNf,
    );
    expect(svc.list({ militarNf: '3037509' })).toHaveLength(1);
    expect(svc.list({ militarNf: '3670180' })).toHaveLength(2);
  });

  it('listDoDia retorna NS daquela data', () => {
    svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509'],
      },
      sargenteanteNf,
    );
    expect(svc.listDoDia('2026-05-10')).toHaveLength(1);
    expect(svc.listDoDia('2026-05-11')).toHaveLength(0);
  });

  it('update preserva id e criadoEm', () => {
    const n = svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509'],
      },
      sargenteanteNf,
    );
    const updated = svc.update(n.id, {
      descricao: 'X — alterado',
      militaresNfs: ['3037509', '3670180'],
    });
    expect(updated.id).toBe(n.id);
    expect(updated.descricao).toBe('X — alterado');
    expect(updated.militaresNfs).toEqual(['3037509', '3670180']);
    expect(updated.codigo).toBe(n.codigo);
    expect(updated.criadoEm).toBe(n.criadoEm);
  });

  it('remove exclui da lista', () => {
    const n = svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509'],
      },
      sargenteanteNf,
    );
    svc.remove(n.id);
    expect(() => svc.findById(n.id)).toThrow(NotFoundException);
  });
});
