import { describe, it, expect, beforeEach } from 'vitest';
import type { EscalaEspecialMensal } from '@argus/shared-types';
import { EscalasEspeciaisService } from './escalas-especiais.service';

function fakeEscala(over: Partial<EscalaEspecialMensal> = {}): EscalaEspecialMensal {
  return {
    mes: 5,
    ano: 2026,
    origemArquivo: '05 - ESCALA ESPECIAL.xlsm',
    importadoEm: '2026-05-01T00:00:00Z',
    atos: [
      { data: '2026-05-01', militarRaw: 'SGT MARIANE', horario: '07:10 ÀS 13:10', funcao: 'APOIO' },
      { data: '2026-05-01', militarRaw: 'SGT BISSOLI', horario: '13:10 ÀS 19:10', funcao: 'APOIO' },
      { data: '2026-05-02', militarRaw: 'SD LOUREIRO', horario: '12:00 ÀS 18:00', funcao: 'APOIO' },
    ],
    avisos: [],
    ...over,
  };
}

describe('EscalasEspeciaisService', () => {
  let service: EscalasEspeciaisService;
  beforeEach(() => {
    service = new EscalasEspeciaisService();
  });

  it('save + get', () => {
    const e = fakeEscala();
    service.save(e);
    expect(service.get(2026, 5)).toEqual(e);
    expect(service.get(2026, 4)).toBeNull();
  });

  it('list ordena por ano/mes desc', () => {
    service.save(fakeEscala({ ano: 2026, mes: 5 }));
    service.save(fakeEscala({ ano: 2026, mes: 6 }));
    service.save(fakeEscala({ ano: 2026, mes: 4 }));
    const r = service.list().escalas;
    expect(r.map((x) => x.mes)).toEqual([6, 5, 4]);
    expect(r[0]?.totalAtos).toBe(3);
  });

  it('save sobrescreve por ano/mes', () => {
    service.save(fakeEscala({ origemArquivo: 'v1.xlsm' }));
    service.save(fakeEscala({ origemArquivo: 'v2.xlsm' }));
    expect(service.get(2026, 5)?.origemArquivo).toBe('v2.xlsm');
  });

  it('delete remove', () => {
    service.save(fakeEscala());
    expect(service.delete(2026, 5)).toBe(true);
    expect(service.get(2026, 5)).toBeNull();
  });

  it('getAtosDoDia filtra por data', () => {
    service.save(fakeEscala());
    expect(service.getAtosDoDia(2026, 5, '2026-05-01')).toHaveLength(2);
    expect(service.getAtosDoDia(2026, 5, '2026-05-02')).toHaveLength(1);
    expect(service.getAtosDoDia(2026, 5, '2026-05-03')).toEqual([]);
    expect(service.getAtosDoDia(2026, 4, '2026-04-01')).toEqual([]); // mês não importado
  });
});
