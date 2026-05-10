import { describe, it, expect, beforeEach } from 'vitest';
import { ServicoService } from '../servico/servico.service';
import { ConferenciaEquipeService } from './conferencia-equipe.service';

const dataIso = '2026-05-09';
const fiscalNf = '3037509';
const chefeEquipeNf = '3022269';

const e1 = {
  recurso: 'ABTS_01',
  funcao: 'Ch',
  militarOriginalNf: '3037509',
  statusConferencia: 'presente' as const,
};
const e2 = {
  recurso: 'ABTS_01',
  funcao: 'Mot',
  militarOriginalNf: '3670180',
  statusConferencia: 'presente' as const,
};
const e3 = {
  recurso: 'ABTS_01',
  funcao: 'Op1',
  militarOriginalNf: '4750241',
  statusConferencia: 'pendente' as const,
};

describe('ConferenciaEquipeService', () => {
  let svc: ConferenciaEquipeService;
  let servico: ServicoService;

  beforeEach(() => {
    servico = new ServicoService();
    svc = new ConferenciaEquipeService(servico);
  });

  it('getByData retorna vazio antes de qualquer marcação', () => {
    expect(svc.getByData(dataIso)).toEqual([]);
  });

  it('bulkUpdate persiste e retorna entries com timestamp', () => {
    const r = svc.bulkUpdate(dataIso, { entries: [e1, e2] }, chefeEquipeNf);
    expect(r).toHaveLength(2);
    expect(r[0]?.marcadoPorNf).toBe(chefeEquipeNf);
    expect(r[0]?.marcadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('bulkUpdate substitui marcações anteriores (PUT atômico)', () => {
    svc.bulkUpdate(dataIso, { entries: [e1] }, chefeEquipeNf);
    svc.bulkUpdate(dataIso, { entries: [e2] }, chefeEquipeNf);
    const r = svc.getByData(dataIso);
    expect(r).toHaveLength(1);
    expect(r[0]?.funcao).toBe('Mot');
  });

  it('marcarPresenca granular funciona e mantém outras marcações', () => {
    svc.bulkUpdate(dataIso, { entries: [e1, e3] }, chefeEquipeNf);
    svc.marcarPresenca(dataIso, { ...e3, statusConferencia: 'ausente' }, chefeEquipeNf);
    const r = svc.getByData(dataIso);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.funcao === 'Op1')?.statusConferencia).toBe('ausente');
  });

  it('promove Servico para EQUIPE_CONFERIDA quando todas != pendente', () => {
    servico.iniciar(dataIso, fiscalNf);
    expect(servico.get(dataIso).estado).toBe('INICIADO');
    svc.bulkUpdate(dataIso, { entries: [e1, e2] }, chefeEquipeNf);
    expect(servico.get(dataIso).estado).toBe('EQUIPE_CONFERIDA');
  });

  it('NÃO promove se ainda houver pendentes', () => {
    servico.iniciar(dataIso, fiscalNf);
    svc.bulkUpdate(dataIso, { entries: [e1, e3] }, chefeEquipeNf);
    expect(servico.get(dataIso).estado).toBe('INICIADO');
  });

  it('NÃO promove se Servico ainda NAO_INICIADO', () => {
    svc.bulkUpdate(dataIso, { entries: [e1, e2] }, chefeEquipeNf);
    expect(servico.get(dataIso).estado).toBe('NAO_INICIADO');
  });

  it('marcação substituída registra substitutoNf e motivo', () => {
    svc.bulkUpdate(
      dataIso,
      {
        entries: [
          {
            ...e1,
            statusConferencia: 'substituido',
            substitutoNf: '9999999',
            substitutoRaw: 'CB OUTRO',
            motivo: 'Acionamento urgente',
          },
        ],
      },
      chefeEquipeNf,
    );
    const r = svc.getByData(dataIso);
    expect(r[0]?.statusConferencia).toBe('substituido');
    expect(r[0]?.substitutoNf).toBe('9999999');
    expect(r[0]?.motivo).toBe('Acionamento urgente');
  });
});
