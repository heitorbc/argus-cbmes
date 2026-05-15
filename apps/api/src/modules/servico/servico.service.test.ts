import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ServicoService } from './servico.service';

const data = '2026-05-09';
const fiscalNf = '3037509';
const adminNf = '9999999';

/**
 * Helper que executa a transição NAO_INICIADO → PREVIA_INICIADA → INICIADO
 * para os testes que querem chegar direto em INICIADO. Espelha o fluxo do
 * controller (que chama iniciarPrevia + iniciar separadamente).
 */
function iniciarServicoCompleto(svc: ServicoService, dataIso: string, nf: string): void {
  svc.iniciarPrevia(dataIso, nf, nf, true); // isAdmin=true para bypassar gate
  svc.iniciar(dataIso, nf);
}

describe('ServicoService — estado do dia', () => {
  let svc: ServicoService;

  beforeEach(() => {
    svc = new ServicoService();
  });

  it('estado default é NAO_INICIADO', () => {
    const r = svc.get(data);
    expect(r.estado).toBe('NAO_INICIADO');
    expect(r.iniciadoEm).toBeUndefined();
  });

  it('isReadOnly retorna true em NAO_INICIADO (S0.x — só PREVIA_INICIADA libera edição)', () => {
    expect(svc.isReadOnly(data)).toBe(true);
  });

  it('isReadOnly retorna false em PREVIA_INICIADA', () => {
    svc.iniciarPrevia(data, fiscalNf, fiscalNf, false);
    expect(svc.isReadOnly(data)).toBe(false);
  });

  it('iniciar exige passar por PREVIA_INICIADA antes', () => {
    expect(() => svc.iniciar(data, fiscalNf)).toThrow(BadRequestException);
  });

  it('iniciar a partir de PREVIA_INICIADA transiciona para INICIADO + timestamp', () => {
    svc.iniciarPrevia(data, fiscalNf, fiscalNf, false);
    const r = svc.iniciar(data, fiscalNf);
    expect(r.estado).toBe('INICIADO');
    expect(r.iniciadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.iniciadoPorNf).toBe(fiscalNf);
    expect(svc.isReadOnly(data)).toBe(true); // INICIADO+ = read-only
  });

  it('iniciar 2x rejeita com BadRequest', () => {
    iniciarServicoCompleto(svc, data, fiscalNf);
    expect(() => svc.iniciar(data, fiscalNf)).toThrow(BadRequestException);
  });

  it('marcarEquipeConferida sem iniciar rejeita', () => {
    expect(() => svc.marcarEquipeConferida(data)).toThrow(BadRequestException);
  });

  it('marcarEquipeConferida em PREVIA_INICIADA rejeita (serviço ainda não iniciou)', () => {
    svc.iniciarPrevia(data, fiscalNf, fiscalNf, false);
    expect(() => svc.marcarEquipeConferida(data)).toThrow(BadRequestException);
  });

  it('marcarEquipeConferida promove INICIADO → EQUIPE_CONFERIDA', () => {
    iniciarServicoCompleto(svc, data, fiscalNf);
    const r = svc.marcarEquipeConferida(data);
    expect(r.estado).toBe('EQUIPE_CONFERIDA');
    expect(r.conferenciaEquipeEm).toBeDefined();
  });

  it('marcarEquipeConferida é idempotente (mantém timestamp)', () => {
    iniciarServicoCompleto(svc, data, fiscalNf);
    const r1 = svc.marcarEquipeConferida(data);
    const r2 = svc.marcarEquipeConferida(data);
    expect(r2.conferenciaEquipeEm).toBe(r1.conferenciaEquipeEm);
  });

  it('marcarViaturaConferida só promove se equipe já conferida', () => {
    iniciarServicoCompleto(svc, data, fiscalNf);
    const r1 = svc.marcarViaturaConferida(data);
    expect(r1.estado).toBe('INICIADO'); // não promove sem equipe
    expect(r1.conferenciaViaturaEm).toBeDefined();

    svc.marcarEquipeConferida(data);
    const r2 = svc.marcarViaturaConferida(data);
    expect(r2.estado).toBe('VIATURA_CONFERIDA');
  });

  it('encerrar manual rejeita não-admin mesmo após VIATURA_CONFERIDA', () => {
    iniciarServicoCompleto(svc, data, fiscalNf);
    svc.marcarEquipeConferida(data);
    svc.marcarViaturaConferida(data);
    expect(() => svc.encerrar(data, fiscalNf, false)).toThrow(ForbiddenException);
  });

  it('encerrar manual como admin transita para ENCERRADO direto de INICIADO', () => {
    iniciarServicoCompleto(svc, data, fiscalNf);
    const r = svc.encerrar(data, fiscalNf, true);
    expect(r.estado).toBe('ENCERRADO');
    expect(r.encerradoPorNf).toBe(fiscalNf);
  });

  // S0.x — Auto-finalização na passagem de serviço
  it('iniciar do dia D+1 encerra automaticamente o serviço D ainda aberto', () => {
    iniciarServicoCompleto(svc, '2026-05-09', fiscalNf);
    svc.marcarEquipeConferida('2026-05-09');
    svc.marcarViaturaConferida('2026-05-09');
    expect(svc.get('2026-05-09').estado).toBe('VIATURA_CONFERIDA');

    // Passagem de serviço — fiscal do dia 10 inicia o serviço.
    iniciarServicoCompleto(svc, '2026-05-10', '4750241');

    // Dia anterior agora ENCERRADO automaticamente.
    expect(svc.get('2026-05-09').estado).toBe('ENCERRADO');
    expect(svc.get('2026-05-09').encerradoPorNf).toBe('4750241');
    expect(svc.get('2026-05-10').estado).toBe('INICIADO');
  });

  it('iniciar do dia D+2 encerra dias D e D+1 ainda em INICIADO+', () => {
    iniciarServicoCompleto(svc, '2026-05-09', fiscalNf);
    iniciarServicoCompleto(svc, '2026-05-10', '4750241');
    // Sanity: dia 09 já encerrou pelo iniciar do dia 10.
    expect(svc.get('2026-05-09').estado).toBe('ENCERRADO');

    iniciarServicoCompleto(svc, '2026-05-11', '3174824');
    expect(svc.get('2026-05-10').estado).toBe('ENCERRADO');
    expect(svc.get('2026-05-11').estado).toBe('INICIADO');
  });

  it('iniciar não toca dias futuros nem dias com estado NAO_INICIADO/PREVIA_INICIADA', () => {
    // Dia D+1 em PREVIA_INICIADA
    svc.iniciarPrevia('2026-05-10', fiscalNf, fiscalNf, true);
    // Dia D em INICIADO+
    iniciarServicoCompleto(svc, '2026-05-09', fiscalNf);
    expect(svc.get('2026-05-10').estado).toBe('PREVIA_INICIADA');
    // Inicia serviço D+2 — não deve afetar D+1 PREVIA_INICIADA.
    iniciarServicoCompleto(svc, '2026-05-11', '3174824');
    expect(svc.get('2026-05-10').estado).toBe('PREVIA_INICIADA');
    expect(svc.get('2026-05-09').estado).toBe('ENCERRADO');
  });

  it('encerrar manual exige admin (não-admin → ForbiddenException)', () => {
    iniciarServicoCompleto(svc, data, fiscalNf);
    svc.marcarEquipeConferida(data);
    svc.marcarViaturaConferida(data);
    expect(() => svc.encerrar(data, fiscalNf, false)).toThrow(ForbiddenException);
  });

  it('encerrar como admin transita para ENCERRADO em qualquer estado pós-INICIADO', () => {
    iniciarServicoCompleto(svc, data, fiscalNf);
    svc.marcarEquipeConferida(data);
    svc.marcarViaturaConferida(data);
    const r = svc.encerrar(data, fiscalNf, true);
    expect(r.estado).toBe('ENCERRADO');
  });

  it('encerrar 2x rejeita', () => {
    iniciarServicoCompleto(svc, data, fiscalNf);
    svc.marcarEquipeConferida(data);
    svc.marcarViaturaConferida(data);
    svc.encerrar(data, fiscalNf, true);
    expect(() => svc.encerrar(data, fiscalNf, true)).toThrow(BadRequestException);
  });

  it('reset(dataIso) limpa estado da data', () => {
    iniciarServicoCompleto(svc, data, fiscalNf);
    svc.reset(data);
    expect(svc.get(data).estado).toBe('NAO_INICIADO');
  });

  // S6h/2.1 — botão "Preencher Mapa Força" (mock)
  it('marcarPreenchimentoMfIniciado transita VIATURA_CONFERIDA → PREENCHENDO_MF', () => {
    iniciarServicoCompleto(svc, data, fiscalNf);
    svc.marcarEquipeConferida(data);
    svc.marcarViaturaConferida(data);
    const r = svc.marcarPreenchimentoMfIniciado(data);
    expect(r.estado).toBe('PREENCHENDO_MF');
    expect(r.preenchendoMfEm).toBeDefined();
  });

  it('marcarPreenchimentoMfIniciado rejeita se equipe/viatura não conferidas', () => {
    iniciarServicoCompleto(svc, data, fiscalNf);
    expect(() => svc.marcarPreenchimentoMfIniciado(data)).toThrow(BadRequestException);
  });

  it('marcarPreenchimentoMfIniciado é idempotente (mantém timestamp)', () => {
    iniciarServicoCompleto(svc, data, fiscalNf);
    svc.marcarEquipeConferida(data);
    svc.marcarViaturaConferida(data);
    const r1 = svc.marcarPreenchimentoMfIniciado(data);
    const r2 = svc.marcarPreenchimentoMfIniciado(data);
    expect(r2.preenchendoMfEm).toBe(r1.preenchendoMfEm);
  });
});

// ── S0.x/rename-mapa-forca — iniciarPrevia / cancelarPrevia / podeEditarAjustes ──
describe('ServicoService — Prévia (estado PREVIA_INICIADA)', () => {
  let svc: ServicoService;

  beforeEach(() => {
    svc = new ServicoService();
  });

  it('iniciarPrevia transiciona NAO_INICIADO → PREVIA_INICIADA + timestamp', () => {
    const r = svc.iniciarPrevia(data, fiscalNf, fiscalNf, false);
    expect(r.estado).toBe('PREVIA_INICIADA');
    expect(r.previaIniciadaEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.previaIniciadaPorNf).toBe(fiscalNf);
  });

  it('iniciarPrevia rejeita NF que não é o Fiscal escalado (ForbiddenException)', () => {
    expect(() => svc.iniciarPrevia(data, '0000000', fiscalNf, false)).toThrow(ForbiddenException);
  });

  it('iniciarPrevia permite admin mesmo não sendo o Fiscal escalado', () => {
    const r = svc.iniciarPrevia(data, adminNf, fiscalNf, true);
    expect(r.estado).toBe('PREVIA_INICIADA');
    expect(r.previaIniciadaPorNf).toBe(adminNf);
  });

  it('iniciarPrevia rejeita quando expectedFiscalNf é null e não-admin', () => {
    expect(() => svc.iniciarPrevia(data, fiscalNf, null, false)).toThrow(ForbiddenException);
  });

  it('iniciarPrevia 2x rejeita (já está em PREVIA_INICIADA)', () => {
    svc.iniciarPrevia(data, fiscalNf, fiscalNf, false);
    expect(() => svc.iniciarPrevia(data, fiscalNf, fiscalNf, false)).toThrow(BadRequestException);
  });

  it('cancelarPrevia volta para NAO_INICIADO + limpa campos', () => {
    svc.iniciarPrevia(data, fiscalNf, fiscalNf, false);
    const r = svc.cancelarPrevia(data, fiscalNf, false);
    expect(r.estado).toBe('NAO_INICIADO');
    expect(r.previaIniciadaEm).toBeUndefined();
    expect(r.previaIniciadaPorNf).toBeUndefined();
  });

  it('cancelarPrevia rejeita se NF não é quem iniciou (não-admin)', () => {
    svc.iniciarPrevia(data, fiscalNf, fiscalNf, false);
    expect(() => svc.cancelarPrevia(data, '0000000', false)).toThrow(ForbiddenException);
  });

  it('cancelarPrevia admin pode cancelar mesmo sem ter iniciado', () => {
    svc.iniciarPrevia(data, fiscalNf, fiscalNf, false);
    const r = svc.cancelarPrevia(data, adminNf, true);
    expect(r.estado).toBe('NAO_INICIADO');
  });

  it('cancelarPrevia rejeita se estado não é PREVIA_INICIADA', () => {
    expect(() => svc.cancelarPrevia(data, fiscalNf, false)).toThrow(BadRequestException);
  });

  it('podeEditarAjustes false em NAO_INICIADO', () => {
    expect(svc.podeEditarAjustes(data, fiscalNf, false)).toBe(false);
  });

  it('podeEditarAjustes true para iniciador em PREVIA_INICIADA', () => {
    svc.iniciarPrevia(data, fiscalNf, fiscalNf, false);
    expect(svc.podeEditarAjustes(data, fiscalNf, false)).toBe(true);
  });

  it('podeEditarAjustes false para outro NF em PREVIA_INICIADA (não-admin)', () => {
    svc.iniciarPrevia(data, fiscalNf, fiscalNf, false);
    expect(svc.podeEditarAjustes(data, '0000000', false)).toBe(false);
  });

  it('podeEditarAjustes true para admin em PREVIA_INICIADA mesmo sem ser iniciador', () => {
    svc.iniciarPrevia(data, fiscalNf, fiscalNf, false);
    expect(svc.podeEditarAjustes(data, adminNf, true)).toBe(true);
  });

  it('podeEditarAjustes false em INICIADO mesmo para admin (Prévia já fechada)', () => {
    iniciarServicoCompleto(svc, data, fiscalNf);
    expect(svc.podeEditarAjustes(data, fiscalNf, true)).toBe(false);
  });
});

describe('ServicoService — Alterações Diversas (F6)', () => {
  let svc: ServicoService;

  beforeEach(() => {
    svc = new ServicoService();
    iniciarServicoCompleto(svc, data, fiscalNf);
  });

  it('addAlteracao gera id + timestamp + persiste por data', () => {
    const a = svc.addAlteracao(
      data,
      {
        tipo: 'troca_militar',
        recurso: 'ABTS_01',
        funcao: 'Op1',
        militarOriginalNf: '111',
        militarSubstitutoNf: '222',
        motivo: 'Acionamento urgente',
      },
      fiscalNf,
    );
    expect(a.id).toBeDefined();
    expect(a.data).toBe(data);
    expect(a.registradoPorNf).toBe(fiscalNf);
    expect(a.registradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(svc.listAlteracoes(data)).toHaveLength(1);
  });

  it('addAlteracao rejeita se serviço NAO_INICIADO', () => {
    svc.reset(data);
    expect(() => svc.addAlteracao(data, { tipo: 'observacao', observacao: 'x' }, fiscalNf)).toThrow(
      BadRequestException,
    );
  });

  it('addAlteracao rejeita se serviço apenas em PREVIA_INICIADA', () => {
    svc.reset(data);
    svc.iniciarPrevia(data, fiscalNf, fiscalNf, false);
    expect(() => svc.addAlteracao(data, { tipo: 'observacao', observacao: 'x' }, fiscalNf)).toThrow(
      BadRequestException,
    );
  });

  it('listAlteracoes retorna em ordem cronológica de inserção', () => {
    svc.addAlteracao(data, { tipo: 'observacao', observacao: 'A' }, fiscalNf);
    svc.addAlteracao(data, { tipo: 'observacao', observacao: 'B' }, fiscalNf);
    const list = svc.listAlteracoes(data);
    expect(list).toHaveLength(2);
    expect(list[0]?.observacao).toBe('A');
    expect(list[1]?.observacao).toBe('B');
  });
});
