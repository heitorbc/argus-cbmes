import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ServicoService } from './servico.service';

const data = '2026-05-09';
const fiscalNf = '3037509';

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

  it('isReadOnly retorna false em NAO_INICIADO', () => {
    expect(svc.isReadOnly(data)).toBe(false);
  });

  it('iniciar transiciona NAO_INICIADO → INICIADO + timestamp', () => {
    const r = svc.iniciar(data, fiscalNf);
    expect(r.estado).toBe('INICIADO');
    expect(r.iniciadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.iniciadoPorNf).toBe(fiscalNf);
    expect(svc.isReadOnly(data)).toBe(true);
  });

  it('iniciar 2x rejeita com BadRequest', () => {
    svc.iniciar(data, fiscalNf);
    expect(() => svc.iniciar(data, fiscalNf)).toThrow(BadRequestException);
  });

  it('marcarEquipeConferida sem iniciar rejeita', () => {
    expect(() => svc.marcarEquipeConferida(data)).toThrow(BadRequestException);
  });

  it('marcarEquipeConferida promove INICIADO → EQUIPE_CONFERIDA', () => {
    svc.iniciar(data, fiscalNf);
    const r = svc.marcarEquipeConferida(data);
    expect(r.estado).toBe('EQUIPE_CONFERIDA');
    expect(r.conferenciaEquipeEm).toBeDefined();
  });

  it('marcarEquipeConferida é idempotente (mantém timestamp)', () => {
    svc.iniciar(data, fiscalNf);
    const r1 = svc.marcarEquipeConferida(data);
    const r2 = svc.marcarEquipeConferida(data);
    expect(r2.conferenciaEquipeEm).toBe(r1.conferenciaEquipeEm);
  });

  it('marcarViaturaConferida só promove se equipe já conferida', () => {
    svc.iniciar(data, fiscalNf);
    const r1 = svc.marcarViaturaConferida(data);
    expect(r1.estado).toBe('INICIADO'); // não promove sem equipe
    expect(r1.conferenciaViaturaEm).toBeDefined();

    svc.marcarEquipeConferida(data);
    const r2 = svc.marcarViaturaConferida(data);
    expect(r2.estado).toBe('VIATURA_CONFERIDA');
  });

  it('encerrar rejeita se não passou por VIATURA_CONFERIDA (sem force)', () => {
    svc.iniciar(data, fiscalNf);
    expect(() => svc.encerrar(data, fiscalNf, false)).toThrow(ForbiddenException);
  });

  it('encerrar com force=true permite atalho (admin override)', () => {
    svc.iniciar(data, fiscalNf);
    const r = svc.encerrar(data, fiscalNf, true);
    expect(r.estado).toBe('ENCERRADO');
    expect(r.encerradoPorNf).toBe(fiscalNf);
  });

  it('encerrar do estado VIATURA_CONFERIDA passa', () => {
    svc.iniciar(data, fiscalNf);
    svc.marcarEquipeConferida(data);
    svc.marcarViaturaConferida(data);
    const r = svc.encerrar(data, fiscalNf, false);
    expect(r.estado).toBe('ENCERRADO');
  });

  it('encerrar 2x rejeita', () => {
    svc.iniciar(data, fiscalNf);
    svc.marcarEquipeConferida(data);
    svc.marcarViaturaConferida(data);
    svc.encerrar(data, fiscalNf, false);
    expect(() => svc.encerrar(data, fiscalNf, false)).toThrow(BadRequestException);
  });

  it('reset(dataIso) limpa estado da data', () => {
    svc.iniciar(data, fiscalNf);
    svc.reset(data);
    expect(svc.get(data).estado).toBe('NAO_INICIADO');
  });
});

describe('ServicoService — Alterações Diversas (F6)', () => {
  let svc: ServicoService;

  beforeEach(() => {
    svc = new ServicoService();
    svc.iniciar(data, fiscalNf);
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

  it('listAlteracoes retorna em ordem cronológica de inserção', () => {
    svc.addAlteracao(data, { tipo: 'observacao', observacao: 'A' }, fiscalNf);
    svc.addAlteracao(data, { tipo: 'observacao', observacao: 'B' }, fiscalNf);
    const list = svc.listAlteracoes(data);
    expect(list).toHaveLength(2);
    expect(list[0]?.observacao).toBe('A');
    expect(list[1]?.observacao).toBe('B');
  });
});
