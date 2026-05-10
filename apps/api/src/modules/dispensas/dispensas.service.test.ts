import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DispensasService } from './dispensas.service';

const NF1 = '3037509';
const NF2 = '3670180';
const sargenteanteNf = '9999999';

describe('DispensasService (S6j)', () => {
  let svc: DispensasService;

  beforeEach(() => {
    svc = new DispensasService();
  });

  it('create gera id + timestamps', () => {
    const d = svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-05-10', dias: 4 },
      sargenteanteNf,
    );
    expect(d.id).toMatch(/^disp:/);
    expect(d.criadoPorNf).toBe(sargenteanteNf);
    expect(d.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(d.tipo).toBe('I_TAF');
    expect(d.dias).toBe(4);
  });

  it('createOrConflict rejeita duplicata exata militar+tipo+dataInicio', () => {
    svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-05-10', dias: 4 },
      sargenteanteNf,
    );
    expect(() =>
      svc.createOrConflict(
        { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-05-10', dias: 4 },
        sargenteanteNf,
      ),
    ).toThrow(ConflictException);
  });

  it('list filtra por militarNf', () => {
    svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-05-10', dias: 4 },
      sargenteanteNf,
    );
    svc.create(
      { militarNf: NF2, tipo: 'V_ANIVERSARIO', dataInicio: '2026-05-12', dias: 1 },
      sargenteanteNf,
    );
    expect(svc.list({ militarNf: NF1 })).toHaveLength(1);
    expect(svc.list({ militarNf: NF2 })).toHaveLength(1);
  });

  it('list filtra por ano da dataInicio', () => {
    svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2025-12-01', dias: 4 },
      sargenteanteNf,
    );
    svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-01-15', dias: 4 },
      sargenteanteNf,
    );
    expect(svc.list({ ano: 2025 })).toHaveLength(1);
    expect(svc.list({ ano: 2026 })).toHaveLength(1);
  });

  it('listAtivasNoDia retorna dispensas que cobrem a data', () => {
    // Dispensa 2026-05-10 + 4 dias cobre 10, 11, 12, 13
    svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-05-10', dias: 4 },
      sargenteanteNf,
    );
    expect(svc.listAtivasNoDia('2026-05-10')).toHaveLength(1);
    expect(svc.listAtivasNoDia('2026-05-13')).toHaveLength(1);
    expect(svc.listAtivasNoDia('2026-05-14')).toHaveLength(0); // exclusive
    expect(svc.listAtivasNoDia('2026-05-09')).toHaveLength(0);
  });

  it('saldoMilitar agrupa dias por tipo no ano', () => {
    svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-03-01', dias: 4 },
      sargenteanteNf,
    );
    svc.create(
      { militarNf: NF1, tipo: 'V_ANIVERSARIO', dataInicio: '2026-04-15', dias: 1 },
      sargenteanteNf,
    );
    svc.create(
      { militarNf: NF1, tipo: 'VI_ASSIDUIDADE', dataInicio: '2026-05-10', dias: 6 },
      sargenteanteNf,
    );
    const s = svc.saldoMilitar(NF1, 2026);
    expect(s.totalGozado).toBe(11);
    const taf = s.saldosPorTipo.find((x) => x.tipo === 'I_TAF')!;
    expect(taf.diasGozados).toBe(4);
    expect(taf.limite).toBe(4);
    expect(taf.diasRestantes).toBe(0);
    const ass = s.saldosPorTipo.find((x) => x.tipo === 'VI_ASSIDUIDADE')!;
    expect(ass.diasRestantes).toBe(0); // 6/6
  });

  it('VIII_DIVERSAS tem limite 999 (sem limite efetivo)', () => {
    svc.create(
      { militarNf: NF1, tipo: 'VIII_DIVERSAS', dataInicio: '2026-03-01', dias: 30 },
      sargenteanteNf,
    );
    const s = svc.saldoMilitar(NF1, 2026);
    const div = s.saldosPorTipo.find((x) => x.tipo === 'VIII_DIVERSAS')!;
    expect(div.limite).toBe(999);
    expect(div.diasRestantes).toBe(969);
  });

  it('update altera campos preservando id e criadoEm', () => {
    const d = svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-05-10', dias: 4 },
      sargenteanteNf,
    );
    const updated = svc.update(d.id, { dias: 3, numeroEdocs: 'EDOCS-001' });
    expect(updated.id).toBe(d.id);
    expect(updated.dias).toBe(3);
    expect(updated.numeroEdocs).toBe('EDOCS-001');
    expect(updated.criadoEm).toBe(d.criadoEm);
  });

  it('remove exclui da lista', () => {
    const d = svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-05-10', dias: 4 },
      sargenteanteNf,
    );
    svc.remove(d.id);
    expect(() => svc.findById(d.id)).toThrow(NotFoundException);
  });

  it('findById lança NotFound para id desconhecido', () => {
    expect(() => svc.findById('disp:xpto')).toThrow(NotFoundException);
  });
});
