import { describe, it, expect, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ServicoService } from '../servico/servico.service';
import { AjustesPreviaService, atoKey } from './ajustes-previa.service';

const FISCAL_NF = '3037509';
const VAZIO_INPUT = {
  trocas: [],
  escalaEspecial: {},
  notasServico: [],
  dispensas: [],
  trocasEscalaEspecial: [],
};

/**
 * Helper que coloca o serviço em PREVIA_INICIADA (estado em que edição é
 * permitida) e retorna o NF de quem iniciou — para ser usado nos testes que
 * exercitam edição.
 */
function iniciarPrevia(servico: ServicoService, dataIso: string, nf = FISCAL_NF): void {
  servico.iniciarPrevia(dataIso, nf, nf, true); // isAdmin=true para bypassar gate de Fiscal escalado
}

describe('AjustesPreviaService — trocas de Escala Especial (S6a-fix)', () => {
  let service: AjustesPreviaService;
  let servico: ServicoService;
  const dataIso = '2026-05-09';
  const ato = {
    data: dataIso,
    militarRaw: 'SGT MARIANE',
    horario: '07:10 ÀS 13:10',
    funcao: 'APOIO',
  };

  beforeEach(() => {
    servico = new ServicoService();
    service = new AjustesPreviaService(servico);
    iniciarPrevia(servico, dataIso);
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
      FISCAL_NF,
    );

    expect(t.substitutoRaw).toBe('SGT BARCELLOS');
    expect(t.registradoPorNf).toBe(FISCAL_NF);
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
      FISCAL_NF,
    );
    service.addTrocaEscalaEspecial(
      dataIso,
      {
        atoOriginal: ato,
        substituidoRaw: 'SGT MARIANE',
        substitutoRaw: 'SGT VICENTE',
      },
      FISCAL_NF,
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
        FISCAL_NF,
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
      FISCAL_NF,
    );
    const ok = service.removeTrocaEscalaEspecial(dataIso, atoKey(ato), FISCAL_NF);
    expect(ok).toBe(true);
    expect(service.get(dataIso).trocasEscalaEspecial).toHaveLength(0);
  });

  it('remove devolve false quando atoKey não existe', () => {
    const ok = service.removeTrocaEscalaEspecial(dataIso, 'inexistente', FISCAL_NF);
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
      FISCAL_NF,
    );
    service.upsert(dataIso, VAZIO_INPUT, FISCAL_NF);
    expect(service.get(dataIso).trocasEscalaEspecial).toHaveLength(1);
  });
});

describe('AjustesPreviaService — gate de edição (S0.x/rename-mapa-forca)', () => {
  let service: AjustesPreviaService;
  let servico: ServicoService;
  const dataIso = '2026-05-09';
  const ato = {
    data: dataIso,
    militarRaw: 'SGT MARIANE',
    horario: '07:10 ÀS 13:10',
    funcao: 'APOIO',
  };

  beforeEach(() => {
    servico = new ServicoService();
    service = new AjustesPreviaService(servico);
  });

  it('upsert rejeita em NAO_INICIADO (precisa "Iniciar Prévia do Mapa Força" primeiro)', () => {
    expect(() => service.upsert(dataIso, VAZIO_INPUT, FISCAL_NF)).toThrow(ForbiddenException);
  });

  it('upsert rejeita em PREVIA_INICIADA quando NF não é o iniciador (não-admin)', () => {
    servico.iniciarPrevia(dataIso, FISCAL_NF, FISCAL_NF, false);
    expect(() => service.upsert(dataIso, VAZIO_INPUT, '0000000', false)).toThrow(
      ForbiddenException,
    );
  });

  it('upsert permitido em PREVIA_INICIADA quando NF é o iniciador', () => {
    servico.iniciarPrevia(dataIso, FISCAL_NF, FISCAL_NF, false);
    expect(() => service.upsert(dataIso, VAZIO_INPUT, FISCAL_NF, false)).not.toThrow();
  });

  it('upsert permitido para admin mesmo sem iniciar Prévia (override)', () => {
    expect(() => service.upsert(dataIso, VAZIO_INPUT, '0000000', true)).not.toThrow();
  });

  it('upsert rejeita após iniciar serviço (estado INICIADO)', () => {
    servico.iniciarPrevia(dataIso, FISCAL_NF, FISCAL_NF, false);
    servico.iniciar(dataIso, FISCAL_NF);
    expect(() => service.upsert(dataIso, VAZIO_INPUT, FISCAL_NF, false)).toThrow(
      ForbiddenException,
    );
  });

  it('upsert permitido com isAdmin=true mesmo após iniciado (admin override)', () => {
    servico.iniciarPrevia(dataIso, FISCAL_NF, FISCAL_NF, false);
    servico.iniciar(dataIso, FISCAL_NF);
    expect(() => service.upsert(dataIso, VAZIO_INPUT, FISCAL_NF, true)).not.toThrow();
  });

  it('addTrocaEscalaEspecial rejeita após iniciar serviço (sem isAdmin)', () => {
    servico.iniciarPrevia(dataIso, FISCAL_NF, FISCAL_NF, false);
    servico.iniciar(dataIso, FISCAL_NF);
    expect(() =>
      service.addTrocaEscalaEspecial(
        dataIso,
        { atoOriginal: ato, substituidoRaw: 'X', substitutoRaw: 'Y' },
        FISCAL_NF,
        false,
      ),
    ).toThrow(ForbiddenException);
  });

  it('removeTrocaEscalaEspecial rejeita após iniciar serviço (sem isAdmin)', () => {
    iniciarPrevia(servico, dataIso);
    service.addTrocaEscalaEspecial(
      dataIso,
      { atoOriginal: ato, substituidoRaw: 'X', substitutoRaw: 'Y' },
      FISCAL_NF,
    );
    servico.iniciar(dataIso, FISCAL_NF);
    expect(() => service.removeTrocaEscalaEspecial(dataIso, atoKey(ato), FISCAL_NF, false)).toThrow(
      ForbiddenException,
    );
  });
});
