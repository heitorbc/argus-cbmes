import { describe, it, expect, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { MapaForcaDoDia } from '@argus/shared-types';
import { ServicoService } from '../servico/servico.service';
import { ConferenciaEquipeService } from './conferencia-equipe.service';

const dataIso = '2026-05-09';
const fiscalNf = '3037509';
const chefeAbtsNf = '3022269'; // BRUNO MELO
const chefeResgateNf = '3174824'; // KARINA

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

/**
 * Fake MapaForcaService para os tests — devolve recursos comandados
 * conforme o map fixo abaixo. Permite simular Chefe ABTS, Chefe Resgate, etc.
 */
class FakeMapaForcaService {
  private comandadosPorNf: Map<string, string[]> = new Map([
    [chefeAbtsNf, ['ABTS_01']],
    [chefeResgateNf, ['RESGATE_01']],
  ]);

  async recursosComandadosPor(nf: string): Promise<string[]> {
    return this.comandadosPorNf.get(nf) ?? [];
  }

  async recursosOndeMotoristaOuChefe(nf: string): Promise<string[]> {
    return this.recursosComandadosPor(nf);
  }

  async getMapaForcaDoDia(): Promise<MapaForcaDoDia> {
    return {} as MapaForcaDoDia;
  }
}

describe('ConferenciaEquipeService', () => {
  let svc: ConferenciaEquipeService;
  let servico: ServicoService;
  let mapaForca: FakeMapaForcaService;

  beforeEach(() => {
    servico = new ServicoService();
    mapaForca = new FakeMapaForcaService();
    svc = new ConferenciaEquipeService(servico, mapaForca as never);
  });

  it('getByData retorna vazio antes de qualquer marcação', () => {
    expect(svc.getByData(dataIso)).toEqual([]);
  });

  it('bulkUpdate persiste e retorna entries com timestamp (admin override)', async () => {
    const r = await svc.bulkUpdate(dataIso, { entries: [e1, e2] }, chefeAbtsNf, true);
    expect(r).toHaveLength(2);
    expect(r[0]?.marcadoPorNf).toBe(chefeAbtsNf);
    expect(r[0]?.marcadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('bulkUpdate substitui marcações do MESMO recurso (PUT por recurso)', async () => {
    await svc.bulkUpdate(dataIso, { entries: [e1] }, chefeAbtsNf, true);
    await svc.bulkUpdate(dataIso, { entries: [e2] }, chefeAbtsNf, true);
    const r = svc.getByData(dataIso);
    expect(r).toHaveLength(1);
    expect(r[0]?.funcao).toBe('Mot');
  });

  it('marcarPresenca granular funciona e mantém outras marcações', async () => {
    await svc.bulkUpdate(dataIso, { entries: [e1, e3] }, chefeAbtsNf, true);
    await svc.marcarPresenca(dataIso, { ...e3, statusConferencia: 'ausente' }, chefeAbtsNf, true);
    const r = svc.getByData(dataIso);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.funcao === 'Op1')?.statusConferencia).toBe('ausente');
  });

  it('promove Servico para EQUIPE_CONFERIDA quando todas != pendente', async () => {
    servico.iniciarPrevia(dataIso, fiscalNf, fiscalNf, true);
    servico.iniciar(dataIso, fiscalNf);
    expect(servico.get(dataIso).estado).toBe('INICIADO');
    await svc.bulkUpdate(dataIso, { entries: [e1, e2] }, chefeAbtsNf, true);
    expect(servico.get(dataIso).estado).toBe('EQUIPE_CONFERIDA');
  });

  it('NÃO promove se ainda houver pendentes', async () => {
    servico.iniciarPrevia(dataIso, fiscalNf, fiscalNf, true);
    servico.iniciar(dataIso, fiscalNf);
    await svc.bulkUpdate(dataIso, { entries: [e1, e3] }, chefeAbtsNf, true);
    expect(servico.get(dataIso).estado).toBe('INICIADO');
  });

  it('NÃO promove se Servico ainda NAO_INICIADO', async () => {
    await svc.bulkUpdate(dataIso, { entries: [e1, e2] }, chefeAbtsNf, true);
    expect(servico.get(dataIso).estado).toBe('NAO_INICIADO');
  });

  it('marcação substituída registra substitutoNf e motivo', async () => {
    await svc.bulkUpdate(
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
      chefeAbtsNf,
      true,
    );
    const r = svc.getByData(dataIso);
    expect(r[0]?.statusConferencia).toBe('substituido');
    expect(r[0]?.substitutoNf).toBe('9999999');
    expect(r[0]?.motivo).toBe('Acionamento urgente');
  });

  // S6h/2.1 — agregação por equipe
  it('getStatusPorEquipe vazio quando não há marcações', () => {
    expect(svc.getStatusPorEquipe(dataIso).size).toBe(0);
  });

  it('getStatusPorEquipe retorna em_conferencia quando 1+ marcado mas há pendentes', async () => {
    await svc.bulkUpdate(dataIso, { entries: [e1, e3] }, chefeAbtsNf, true);
    expect(svc.getStatusPorEquipe(dataIso).get('ABTS_01')).toBe('em_conferencia');
    expect(svc.equipeConferida(dataIso, 'ABTS_01')).toBe(false);
  });

  it('getStatusPorEquipe retorna conferida quando todas != pendente', async () => {
    await svc.bulkUpdate(dataIso, { entries: [e1, e2] }, chefeAbtsNf, true);
    expect(svc.getStatusPorEquipe(dataIso).get('ABTS_01')).toBe('conferida');
    expect(svc.equipeConferida(dataIso, 'ABTS_01')).toBe(true);
  });

  it('getStatusPorEquipe agrega por recurso (várias equipes coexistem)', async () => {
    const e4 = {
      recurso: 'RESGATE_01',
      funcao: 'Ch',
      militarOriginalNf: '8888888',
      statusConferencia: 'presente' as const,
    };
    await svc.bulkUpdate(dataIso, { entries: [e1, e3, e4] }, chefeAbtsNf, true);
    const m = svc.getStatusPorEquipe(dataIso);
    expect(m.get('ABTS_01')).toBe('em_conferencia'); // tem pendente (e3)
    expect(m.get('RESGATE_01')).toBe('conferida'); // só e4 e está presente
  });

  // S0.x — gating granular por Chefe escalado
  it('Chefe ABTS pode marcar entries do ABTS_01 (sem override)', async () => {
    const r = await svc.bulkUpdate(dataIso, { entries: [e1, e2] }, chefeAbtsNf, false);
    expect(r).toHaveLength(2);
  });

  it('Chefe ABTS NÃO pode marcar entries do RESGATE_01 (ForbiddenException)', async () => {
    const eResgate = {
      recurso: 'RESGATE_01',
      funcao: 'Ch',
      militarOriginalNf: '8888888',
      statusConferencia: 'presente' as const,
    };
    await expect(
      svc.bulkUpdate(dataIso, { entries: [eResgate] }, chefeAbtsNf, false),
    ).rejects.toThrow(ForbiddenException);
  });

  it('NF sem comando não pode marcar nada (ForbiddenException)', async () => {
    await expect(svc.bulkUpdate(dataIso, { entries: [e1] }, '0000000', false)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('bulkUpdate de Chefe RESGATE preserva entries do ABTS marcadas pelo Chefe ABTS', async () => {
    await svc.bulkUpdate(dataIso, { entries: [e1, e2] }, chefeAbtsNf, false);
    const eResgate = {
      recurso: 'RESGATE_01',
      funcao: 'Ch',
      militarOriginalNf: '8888888',
      statusConferencia: 'presente' as const,
    };
    await svc.bulkUpdate(dataIso, { entries: [eResgate] }, chefeResgateNf, false);
    const r = svc.getByData(dataIso);
    // Mantém ABTS (2) e adiciona RESGATE (1).
    expect(r.length).toBe(3);
    expect(r.filter((x) => x.recurso === 'ABTS_01')).toHaveLength(2);
    expect(r.filter((x) => x.recurso === 'RESGATE_01')).toHaveLength(1);
  });
});
