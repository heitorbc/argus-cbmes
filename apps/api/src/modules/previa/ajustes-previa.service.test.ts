import { describe, it, expect, beforeEach } from 'vitest';
import { AjustesPreviaService, atoKey } from './ajustes-previa.service';

describe('AjustesPreviaService — trocas de Escala Especial (S6a-fix)', () => {
  let service: AjustesPreviaService;
  const dataIso = '2026-05-09';
  const ato = {
    data: dataIso,
    militarRaw: 'SGT MARIANE',
    horario: '07:10 ÀS 13:10',
    funcao: 'APOIO',
  };

  beforeEach(() => {
    service = new AjustesPreviaService();
  });

  it('add cria a primeira troca para um ato', () => {
    const t = service.addTrocaEscalaEspecial(
      dataIso,
      {
        atoOriginal: ato,
        substituidoRaw: 'SGT MARIANE',
        substitutoRaw: 'SGT BARCELLOS',
        substitutoNf: '3037509',
      },
      '3037509',
    );

    expect(t.substitutoRaw).toBe('SGT BARCELLOS');
    expect(t.registradoPorNf).toBe('3037509');
    expect(t.registradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const ajustes = service.get(dataIso);
    expect(ajustes.trocasEscalaEspecial).toHaveLength(1);
  });

  it('add substitui troca existente para o mesmo ato (idempotente)', () => {
    service.addTrocaEscalaEspecial(
      dataIso,
      {
        atoOriginal: ato,
        substituidoRaw: 'SGT MARIANE',
        substitutoRaw: 'SGT BARCELLOS',
      },
      '3037509',
    );
    service.addTrocaEscalaEspecial(
      dataIso,
      {
        atoOriginal: ato,
        substituidoRaw: 'SGT MARIANE',
        substitutoRaw: 'SGT VICENTE',
      },
      '3037509',
    );
    const ajustes = service.get(dataIso);
    expect(ajustes.trocasEscalaEspecial).toHaveLength(1);
    expect(ajustes.trocasEscalaEspecial[0]?.substitutoRaw).toBe('SGT VICENTE');
  });

  it('rejeita troca cuja data do ato diverge da data ISO', () => {
    expect(() =>
      service.addTrocaEscalaEspecial(
        '2026-05-09',
        {
          atoOriginal: { ...ato, data: '2026-05-10' },
          substituidoRaw: 'X',
          substitutoRaw: 'Y',
        },
        '3037509',
      ),
    ).toThrow(/2026-05-10.*2026-05-09/);
  });

  it('remove encontra por atoKey e devolve true', () => {
    service.addTrocaEscalaEspecial(
      dataIso,
      {
        atoOriginal: ato,
        substituidoRaw: 'SGT MARIANE',
        substitutoRaw: 'SGT BARCELLOS',
      },
      '3037509',
    );
    const ok = service.removeTrocaEscalaEspecial(dataIso, atoKey(ato));
    expect(ok).toBe(true);
    expect(service.get(dataIso).trocasEscalaEspecial).toHaveLength(0);
  });

  it('remove devolve false quando atoKey não existe', () => {
    const ok = service.removeTrocaEscalaEspecial(dataIso, 'inexistente');
    expect(ok).toBe(false);
  });

  it('upsert preserva trocasEscalaEspecial existentes (não sobrescreve via PUT genérico)', () => {
    service.addTrocaEscalaEspecial(
      dataIso,
      {
        atoOriginal: ato,
        substituidoRaw: 'SGT MARIANE',
        substitutoRaw: 'SGT BARCELLOS',
      },
      '3037509',
    );
    service.upsert(dataIso, {
      trocas: [],
      escalaEspecial: {},
      notasServico: [],
      dispensas: [],
      trocasEscalaEspecial: [],
    });
    expect(service.get(dataIso).trocasEscalaEspecial).toHaveLength(1);
  });
});
