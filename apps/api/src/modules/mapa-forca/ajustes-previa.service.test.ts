import { describe, it, expect, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { makeAprovacoesPrismaMock } from '../../common/prisma/prisma-test-mock';
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
    service = new AjustesPreviaService(servico, makeAprovacoesPrismaMock());
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
    service = new AjustesPreviaService(servico, makeAprovacoesPrismaMock());
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

describe('AjustesPreviaService — aprovações individuais (S2.10.7b/Partes C+G)', () => {
  let service: AjustesPreviaService;
  let servico: ServicoService;
  const dataIso = '2026-05-09';

  beforeEach(() => {
    servico = new ServicoService();
    service = new AjustesPreviaService(servico, makeAprovacoesPrismaMock());
    iniciarPrevia(servico, dataIso);
  });

  it('getAprovacoes devolve mapa vazio antes de qualquer decisão', async () => {
    const aprovacoes = await service.getAprovacoes(dataIso);
    expect(aprovacoes.size).toBe(0);
  });

  it('setAprovacaoItem grava decisão "aprovar" como aprovada', async () => {
    const status = await service.setAprovacaoItem(
      dataIso,
      'troca',
      'troca-1',
      'aprovar',
      FISCAL_NF,
    );
    expect(status).toBe('aprovada');
    const aprovacoes = await service.getAprovacoes(dataIso);
    expect(aprovacoes.get('troca:troca-1')).toBe('aprovada');
  });

  it('setAprovacaoItem é idempotente (mesma decisão reaplica)', async () => {
    await service.setAprovacaoItem(dataIso, 'dispensa', 'disp-1', 'aprovar', FISCAL_NF);
    const status = await service.setAprovacaoItem(
      dataIso,
      'dispensa',
      'disp-1',
      'aprovar',
      FISCAL_NF,
    );
    expect(status).toBe('aprovada');
    const aprovacoes = await service.getAprovacoes(dataIso);
    expect(aprovacoes.size).toBe(1);
  });

  it('setAprovacaoItem permite inverter aprovada → rejeitada', async () => {
    await service.setAprovacaoItem(dataIso, 'atestado', 'at-1', 'aprovar', FISCAL_NF);
    const status = await service.setAprovacaoItem(
      dataIso,
      'atestado',
      'at-1',
      'rejeitar',
      FISCAL_NF,
    );
    expect(status).toBe('rejeitada');
    const aprovacoes = await service.getAprovacoes(dataIso);
    expect(aprovacoes.get('atestado:at-1')).toBe('rejeitada');
  });

  it('reset limpa também as aprovações do dia', async () => {
    await service.setAprovacaoItem(dataIso, 'troca', 't-1', 'aprovar', FISCAL_NF);
    await service.reset(dataIso);
    const aprovacoes = await service.getAprovacoes(dataIso);
    expect(aprovacoes.size).toBe(0);
  });

  it('setAprovacaoItem rejeita após início do serviço (sem isAdmin)', async () => {
    servico.iniciar(dataIso, FISCAL_NF);
    await expect(
      service.setAprovacaoItem(dataIso, 'troca', 't-1', 'aprovar', FISCAL_NF, false),
    ).rejects.toThrow(ForbiddenException);
  });

  it('persistência: aprovação sobrevive a recriação do service (mesmo Prisma)', async () => {
    // Simula restart do AjustesPreviaService mas compartilha o "banco" (Prisma mock).
    const prisma = makeAprovacoesPrismaMock();
    const svc1 = new AjustesPreviaService(servico, prisma);
    await svc1.setAprovacaoItem(dataIso, 'troca', 'persistente-1', 'aprovar', FISCAL_NF);
    const svc2 = new AjustesPreviaService(servico, prisma);
    const aprovacoes = await svc2.getAprovacoes(dataIso);
    expect(aprovacoes.get('troca:persistente-1')).toBe('aprovada');
  });
});

describe('AjustesPreviaService — empenhos de Escala Especial (S2.10.7b/Parte F)', () => {
  let service: AjustesPreviaService;
  let servico: ServicoService;
  const dataIso = '2026-05-09';
  const ato = {
    data: dataIso,
    militarRaw: 'CB HENRIQUE LOPES',
    horario: '07:10 ÀS 13:10',
    funcao: 'APOIO',
  };

  beforeEach(() => {
    servico = new ServicoService();
    service = new AjustesPreviaService(servico, makeAprovacoesPrismaMock());
    iniciarPrevia(servico, dataIso);
  });

  it('add cria empenho com timestamps + nf de registro', () => {
    const e = service.addEmpenhoEscalaEspecial(
      dataIso,
      {
        atoOriginal: ato,
        recursoAlvo: 'SENTINELA 1',
        funcaoAlvo: 'Sent. 1',
        periodoInicio: '07:10',
        periodoFim: '09:10',
      },
      FISCAL_NF,
    );
    expect(e.recursoAlvo).toBe('SENTINELA 1');
    expect(e.registradoPorNf).toBe(FISCAL_NF);
    expect(e.registradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(service.get(dataIso).empenhosEscalaEspecial).toHaveLength(1);
  });

  it('add substitui empenho existente para o mesmo (ato, recurso, função)', () => {
    service.addEmpenhoEscalaEspecial(
      dataIso,
      {
        atoOriginal: ato,
        recursoAlvo: 'SENTINELA 1',
        funcaoAlvo: 'Sent. 1',
        periodoInicio: '07:10',
        periodoFim: '08:10',
      },
      FISCAL_NF,
    );
    service.addEmpenhoEscalaEspecial(
      dataIso,
      {
        atoOriginal: ato,
        recursoAlvo: 'SENTINELA 1',
        funcaoAlvo: 'Sent. 1',
        periodoInicio: '09:00',
        periodoFim: '11:00',
      },
      FISCAL_NF,
    );
    const ajustes = service.get(dataIso);
    expect(ajustes.empenhosEscalaEspecial).toHaveLength(1);
    expect(ajustes.empenhosEscalaEspecial?.[0]?.periodoInicio).toBe('09:00');
  });

  it('add permite empenhos paralelos do mesmo ato em recursos diferentes', () => {
    service.addEmpenhoEscalaEspecial(
      dataIso,
      {
        atoOriginal: ato,
        recursoAlvo: 'SENTINELA 1',
        funcaoAlvo: 'Sent. 1',
        periodoInicio: '07:10',
        periodoFim: '09:10',
      },
      FISCAL_NF,
    );
    service.addEmpenhoEscalaEspecial(
      dataIso,
      {
        atoOriginal: ato,
        recursoAlvo: 'ABTS_01',
        funcaoAlvo: 'Op 2',
        periodoInicio: '09:10',
        periodoFim: '11:10',
      },
      FISCAL_NF,
    );
    expect(service.get(dataIso).empenhosEscalaEspecial).toHaveLength(2);
  });

  it('add rejeita período inválido (fim ≤ início)', () => {
    expect(() =>
      service.addEmpenhoEscalaEspecial(
        dataIso,
        {
          atoOriginal: ato,
          recursoAlvo: 'SENTINELA 1',
          funcaoAlvo: 'Sent. 1',
          periodoInicio: '10:00',
          periodoFim: '10:00',
        },
        FISCAL_NF,
      ),
    ).toThrow(/Período inválido/);
  });

  it('add rejeita data do ato divergente do dia', () => {
    expect(() =>
      service.addEmpenhoEscalaEspecial(
        '2026-05-09',
        {
          atoOriginal: { ...ato, data: '2026-05-10' },
          recursoAlvo: 'SENTINELA 1',
          funcaoAlvo: 'Sent. 1',
          periodoInicio: '07:10',
          periodoFim: '09:10',
        },
        FISCAL_NF,
      ),
    ).toThrow(/2026-05-10.*2026-05-09/);
  });

  it('remove encontra por empenhoKey', () => {
    service.addEmpenhoEscalaEspecial(
      dataIso,
      {
        atoOriginal: ato,
        recursoAlvo: 'SENTINELA 1',
        funcaoAlvo: 'Sent. 1',
        periodoInicio: '07:10',
        periodoFim: '09:10',
      },
      FISCAL_NF,
    );
    const key = `${atoKey(ato)}|SENTINELA 1|Sent. 1`;
    expect(service.removeEmpenhoEscalaEspecial(dataIso, key, FISCAL_NF)).toBe(true);
    expect(service.get(dataIso).empenhosEscalaEspecial).toHaveLength(0);
  });

  it('remove devolve false quando empenho não existe', () => {
    expect(service.removeEmpenhoEscalaEspecial(dataIso, 'inexistente', FISCAL_NF)).toBe(false);
  });
});

describe('AjustesPreviaService.upsert — fix trocas duplicadas (S0.x/fixes-3)', () => {
  let service: AjustesPreviaService;
  let servico: ServicoService;
  const dataIso = '2026-05-15';

  beforeEach(() => {
    servico = new ServicoService();
    service = new AjustesPreviaService(servico, makeAprovacoesPrismaMock());
    iniciarPrevia(servico, dataIso);
  });

  it('descarta trocas com origemAutorizada=true (re-injetadas pelo PreviaService a cada GET)', () => {
    service.upsert(
      dataIso,
      {
        ...VAZIO_INPUT,
        trocas: [
          // Troca autorizada (vem da planilha) — deve ser DESCARTADA
          {
            substituidoRaw: 'CB LAUFF',
            substituidoNf: '3477630',
            substitutoRaw: 'CB VICENTE',
            substitutoNf: '3670180',
            periodo: '24h',
            origemAutorizada: true,
          },
          // Troca manual — deve ser PERSISTIDA
          {
            substituidoRaw: 'SD A',
            substitutoRaw: 'SD B',
            periodo: '24h',
          },
        ],
      },
      FISCAL_NF,
    );
    const ajustes = service.get(dataIso);
    expect(ajustes.trocas).toHaveLength(1);
    expect(ajustes.trocas[0]?.substituidoRaw).toBe('SD A');
  });

  it('múltiplos upserts NÃO acumulam trocas autorizadas (idempotente)', () => {
    const trocaAutorizada = {
      substituidoRaw: 'CB LAUFF',
      substitutoRaw: 'CB VICENTE',
      periodo: '24h',
      origemAutorizada: true,
    };
    service.upsert(dataIso, { ...VAZIO_INPUT, trocas: [trocaAutorizada] }, FISCAL_NF);
    service.upsert(dataIso, { ...VAZIO_INPUT, trocas: [trocaAutorizada] }, FISCAL_NF);
    service.upsert(dataIso, { ...VAZIO_INPUT, trocas: [trocaAutorizada] }, FISCAL_NF);
    expect(service.get(dataIso).trocas).toHaveLength(0);
  });
});
