import { describe, it, expect } from 'vitest';
import type { ParteDiariaMilitarRef } from '@argus/shared-types';
import { gerarGuardaRotativa, gerarTurnosRonda } from './parte-diaria.service';

function militar(nf: string, nome: string): ParteDiariaMilitarRef {
  return { posto: 'SD', nome, nomeGuerra: nome, nf };
}

describe('gerarGuardaRotativa', () => {
  it('com 3 sentinelas faz rodízio cíclico nas 12 slots', () => {
    const guardas = [militar('1', 'SCARAMUSSA'), militar('2', 'SCALZER'), militar('3', 'LOUREIRO')];
    const tabela = gerarGuardaRotativa(guardas);
    expect(tabela.length).toBe(12);
    // Slot 0 → SCARAMUSSA (Sent. 1), Slot 1 → SCALZER (Sent. 2), Slot 2 → LOUREIRO (Sent. 3)
    expect(tabela[0]?.militarRaw).toContain('SCARAMUSSA');
    expect(tabela[0]?.sentinelaSlot).toBe('1');
    expect(tabela[1]?.militarRaw).toContain('SCALZER');
    expect(tabela[1]?.sentinelaSlot).toBe('2');
    expect(tabela[2]?.militarRaw).toContain('LOUREIRO');
    expect(tabela[2]?.sentinelaSlot).toBe('3');
    // Slot 3 → SCARAMUSSA novamente (rodízio)
    expect(tabela[3]?.militarRaw).toContain('SCARAMUSSA');
  });

  it('com 0 sentinelas retorna 12 slots vazios', () => {
    const tabela = gerarGuardaRotativa([]);
    expect(tabela.length).toBe(12);
    for (const linha of tabela) {
      expect(linha.militarRaw).toBe('');
      expect(linha.militarNf).toBeUndefined();
    }
  });

  it('horários cobrem 24h em blocos de 2h', () => {
    const tabela = gerarGuardaRotativa([militar('1', 'X')]);
    expect(tabela[0]?.horarioInicio).toBe('00:00');
    expect(tabela[0]?.horarioFim).toBe('02:00');
    expect(tabela[11]?.horarioInicio).toBe('22:00');
    expect(tabela[11]?.horarioFim).toBe('00:00');
  });
});

describe('gerarTurnosRonda', () => {
  it('com 0 militares retorna array vazio', () => {
    expect(gerarTurnosRonda([])).toEqual([]);
  });

  it('com 1 militar gera 1 turno cobrindo 23:10–05:10', () => {
    const turnos = gerarTurnosRonda([militar('1', 'X')]);
    expect(turnos.length).toBe(1);
    expect(turnos[0]?.horarioInicio).toBe('23:10');
    expect(turnos[0]?.horarioFim).toBe('05:10');
  });

  it('com 2 militares gera 2 turnos de 3h', () => {
    const turnos = gerarTurnosRonda([militar('1', 'X'), militar('2', 'Y')]);
    expect(turnos.length).toBe(2);
    expect(turnos[0]?.horarioInicio).toBe('23:10');
    expect(turnos[0]?.horarioFim).toBe('02:10');
    expect(turnos[1]?.horarioInicio).toBe('02:10');
    expect(turnos[1]?.horarioFim).toBe('05:10');
  });

  it('com 3 militares gera 3 turnos de 2h cobrindo 23:10–05:10', () => {
    const turnos = gerarTurnosRonda([militar('1', 'A'), militar('2', 'B'), militar('3', 'C')]);
    expect(turnos.length).toBe(3);
    expect(turnos[0]?.horarioInicio).toBe('23:10');
    expect(turnos[0]?.horarioFim).toBe('01:10');
    expect(turnos[1]?.horarioInicio).toBe('01:10');
    expect(turnos[1]?.horarioFim).toBe('03:10');
    expect(turnos[2]?.horarioInicio).toBe('03:10');
    expect(turnos[2]?.horarioFim).toBe('05:10');
  });

  it('com 6 militares gera 6 turnos de 1h sem sobreposição', () => {
    const m = (n: number) => militar(String(n), `M${n}`);
    const turnos = gerarTurnosRonda([m(1), m(2), m(3), m(4), m(5), m(6)]);
    expect(turnos.length).toBe(6);
    // Cada turno tem 60 min; final do anterior == início do próximo
    for (let i = 1; i < turnos.length; i += 1) {
      expect(turnos[i]?.horarioInicio).toBe(turnos[i - 1]?.horarioFim);
    }
    expect(turnos[5]?.horarioFim).toBe('05:10');
  });
});
