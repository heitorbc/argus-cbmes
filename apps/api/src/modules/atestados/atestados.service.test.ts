import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ServicoService } from '../servico/servico.service';
import { AtestadosService } from './atestados.service';

const NF1 = '3037509';
const NF2 = '3670180';
const sargenteanteNf = '9999999';

describe('AtestadosService (S6k)', () => {
  let svc: AtestadosService;

  beforeEach(() => {
    svc = new AtestadosService(new ServicoService());
  });

  it('create gera id + timestamps', () => {
    const a = svc.create(
      {
        militarNf: NF1,
        dataInicio: '2026-05-10',
        dias: 7,
        cid10: 'J11',
        crmMedico: 'CRM-ES 12345',
      },
      sargenteanteNf,
    );
    expect(a.id).toMatch(/^atest:/);
    expect(a.criadoPorNf).toBe(sargenteanteNf);
    expect(a.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(a.cid10).toBe('J11');
    expect(a.crmMedico).toBe('CRM-ES 12345');
    expect(a.dias).toBe(7);
  });

  it('list filtra por militarNf', () => {
    svc.create(
      {
        militarNf: NF1,
        dataInicio: '2026-05-10',
        dias: 5,
        cid10: 'J11',
        crmMedico: 'CRM-ES 1',
      },
      sargenteanteNf,
    );
    svc.create(
      {
        militarNf: NF2,
        dataInicio: '2026-05-12',
        dias: 3,
        cid10: 'S52.5',
        crmMedico: 'CRM-ES 2',
      },
      sargenteanteNf,
    );
    expect(svc.list({ militarNf: NF1 })).toHaveLength(1);
    expect(svc.list({ militarNf: NF2 })).toHaveLength(1);
  });

  it('list filtra por ano da dataInicio', () => {
    svc.create(
      {
        militarNf: NF1,
        dataInicio: '2025-12-29',
        dias: 5,
        cid10: 'J11',
        crmMedico: 'CRM-ES 1',
      },
      sargenteanteNf,
    );
    svc.create(
      {
        militarNf: NF1,
        dataInicio: '2026-01-15',
        dias: 3,
        cid10: 'J20',
        crmMedico: 'CRM-ES 1',
      },
      sargenteanteNf,
    );
    expect(svc.list({ ano: 2025 })).toHaveLength(1);
    expect(svc.list({ ano: 2026 })).toHaveLength(1);
  });

  it('listAtivosNoDia retorna atestados que cobrem a data (intervalo half-open)', () => {
    // Atestado 2026-05-10 + 5 dias cobre 10..14 (exclusivo de 15)
    svc.create(
      {
        militarNf: NF1,
        dataInicio: '2026-05-10',
        dias: 5,
        cid10: 'J11',
        crmMedico: 'CRM-ES 1',
      },
      sargenteanteNf,
    );
    expect(svc.listAtivosNoDia('2026-05-10')).toHaveLength(1);
    expect(svc.listAtivosNoDia('2026-05-14')).toHaveLength(1);
    expect(svc.listAtivosNoDia('2026-05-15')).toHaveLength(0); // exclusive
    expect(svc.listAtivosNoDia('2026-05-09')).toHaveLength(0);
  });

  it('update preserva id e criadoEm', () => {
    const a = svc.create(
      {
        militarNf: NF1,
        dataInicio: '2026-05-10',
        dias: 7,
        cid10: 'J11',
        crmMedico: 'CRM-ES 1',
      },
      sargenteanteNf,
    );
    const updated = svc.update(a.id, { dias: 10, cid10: 'J20' });
    expect(updated.id).toBe(a.id);
    expect(updated.dias).toBe(10);
    expect(updated.cid10).toBe('J20');
    expect(updated.criadoEm).toBe(a.criadoEm);
    // crmMedico não foi enviado — preserva original
    expect(updated.crmMedico).toBe('CRM-ES 1');
  });

  it('remove exclui da lista', () => {
    const a = svc.create(
      {
        militarNf: NF1,
        dataInicio: '2026-05-10',
        dias: 7,
        cid10: 'J11',
        crmMedico: 'CRM-ES 1',
      },
      sargenteanteNf,
    );
    svc.remove(a.id);
    expect(() => svc.findById(a.id)).toThrow(NotFoundException);
  });

  it('findById lança NotFound para id desconhecido', () => {
    expect(() => svc.findById('atest:xpto')).toThrow(NotFoundException);
  });
});
