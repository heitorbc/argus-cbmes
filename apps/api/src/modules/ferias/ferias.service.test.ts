import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FeriasService } from './ferias.service';

const SARG_NF = '2982390';

describe('FeriasService (item 4)', () => {
  let svc: FeriasService;
  beforeEach(() => {
    svc = new FeriasService();
  });

  it('create gera id + dataInicio default = dia 15 do mes + dias = 30', () => {
    const f = svc.create({ militarNf: '3037509', mesAno: '2026-11' }, SARG_NF);
    expect(f.id).toMatch(/^fer:/);
    expect(f.militarNf).toBe('3037509');
    expect(f.dataInicio).toBe('2026-11-15');
    expect(f.dias).toBe(30);
    expect(f.criadoPorNf).toBe(SARG_NF);
  });

  it('create permite override de dataInicio + dias', () => {
    const f = svc.create(
      { militarNf: '3037509', mesAno: '2026-12', dataInicio: '2026-12-22', dias: 20 },
      SARG_NF,
    );
    expect(f.dataInicio).toBe('2026-12-22');
    expect(f.dias).toBe(20);
  });

  it('createOrConflict rejeita duplicata (mesmo militar + mesmo mês)', () => {
    svc.create({ militarNf: '3037509', mesAno: '2026-11' }, SARG_NF);
    expect(() =>
      svc.createOrConflict({ militarNf: '3037509', mesAno: '2026-11' }, SARG_NF),
    ).toThrow(ConflictException);
  });

  it('list filtra por militar e ano', () => {
    svc.create({ militarNf: '3037509', mesAno: '2026-11' }, SARG_NF);
    svc.create({ militarNf: '3037509', mesAno: '2027-03' }, SARG_NF);
    svc.create({ militarNf: '4750713', mesAno: '2026-08' }, SARG_NF);

    expect(svc.list({ militarNf: '3037509' })).toHaveLength(2);
    expect(svc.list({ ano: 2026 })).toHaveLength(2);
    expect(svc.list({ militarNf: '3037509', ano: 2026 })).toHaveLength(1);
  });

  it('listAtivasNoDia retorna férias que cobrem a data', () => {
    svc.create({ militarNf: '3037509', mesAno: '2026-11' }, SARG_NF);
    expect(svc.listAtivasNoDia('2026-11-15')).toHaveLength(1);
    expect(svc.listAtivasNoDia('2026-12-14')).toHaveLength(1); // 30 dias = vai até 14/12
    expect(svc.listAtivasNoDia('2026-12-15')).toHaveLength(0); // dia 31 = fora
    expect(svc.listAtivasNoDia('2026-11-14')).toHaveLength(0); // antes
  });

  it('update preserva campos não enviados', () => {
    const f = svc.create({ militarNf: '3037509', mesAno: '2026-11' }, SARG_NF);
    const updated = svc.update(f.id, { observacoes: 'Adiada' });
    expect(updated.observacoes).toBe('Adiada');
    expect(updated.mesAno).toBe('2026-11');
    expect(updated.dataInicio).toBe('2026-11-15');
  });

  it('remove + findById lança 404 após delete', () => {
    const f = svc.create({ militarNf: '3037509', mesAno: '2026-11' }, SARG_NF);
    svc.remove(f.id);
    expect(() => svc.findById(f.id)).toThrow(NotFoundException);
  });
});
