import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MapaForcaDoDia, Viatura } from '@argus/shared-types';
import { ConferenciaEquipeService } from '../conferencia-equipe/conferencia-equipe.service';
import { ServicoService } from '../servico/servico.service';
import { ViaturasService } from '../viaturas/viaturas.service';
import { ConferenciaViaturaService } from './conferencia-viatura.service';

const dataIso = '2026-05-09';
const motoristaNf = '3670180';

function viatura(prefixo: string, status: 'DISPONIVEL' | 'BAIXADA' = 'DISPONIVEL'): Viatura {
  const now = new Date().toISOString();
  return {
    id: `mf:${prefixo}`,
    prefixo,
    tipo: 'ABTS',
    status,
    origem: 'mapa_forca',
    composicaoFuncoes: [],
    observacoesDataDas: [],
    historicoKm: [],
    criadoEm: now,
    atualizadoEm: now,
  };
}

/**
 * Fake MapaForcaService — diz que o motoristaNf comanda ABTS_01 e que a
 * composicaoMf tem só uma viatura ABTS 011 DISPONIVEL.
 */
class FakeMapaForcaService {
  comandadosByNf: Map<string, string[]> = new Map([[motoristaNf, ['ABTS_01']]]);
  composicaoMf: MapaForcaDoDia['composicaoMf'] = [
    {
      recurso: 'ABTS_01',
      vtrPrefixo: 'ABTS 011',
      vtrStatus: 'DISPONIVEL',
      semEquipe: false,
      equipe: 'C',
      operadores: [],
    },
  ];

  async recursosComandadosPor(nf: string): Promise<string[]> {
    return this.comandadosByNf.get(nf) ?? [];
  }

  async recursosOndeMotoristaOuChefe(nf: string): Promise<string[]> {
    return this.recursosComandadosPor(nf);
  }

  async getMapaForcaDoDia(): Promise<MapaForcaDoDia> {
    return { composicaoMf: this.composicaoMf } as MapaForcaDoDia;
  }
}

describe('ConferenciaViaturaService', () => {
  let svc: ConferenciaViaturaService;
  let viaturasMock: ViaturasService;
  let servico: ServicoService;
  let viaturaAtual: Viatura;
  let mapaForca: FakeMapaForcaService;

  beforeEach(() => {
    servico = new ServicoService();
    viaturaAtual = viatura('ABTS 011');
    viaturaAtual.funcaoOperacional = 'ABTS_01';
    viaturasMock = {
      findByPrefixo: vi.fn().mockImplementation(async (p: string) => {
        return p === viaturaAtual.prefixo ? viaturaAtual : undefined;
      }),
      aplicarConferencia: vi.fn().mockImplementation(
        async (
          _prefixo: string,
          input: {
            kmAtual?: number;
            estadoTanquePercent: number;
            statusMudanca?: 'DISPONIVEL' | 'BAIXADA';
            observacao?: string;
          },
          _nf: string,
        ) => {
          viaturaAtual = {
            ...viaturaAtual,
            kmAtual: input.kmAtual ?? viaturaAtual.kmAtual,
            estadoTanquePercent: input.estadoTanquePercent,
            status: input.statusMudanca ?? viaturaAtual.status,
            atualizadoEm: new Date().toISOString(),
          };
          return viaturaAtual;
        },
      ),
    } as unknown as ViaturasService;
    mapaForca = new FakeMapaForcaService();
    const conferenciaEquipe = new ConferenciaEquipeService(servico, mapaForca as never);
    svc = new ConferenciaViaturaService(
      servico,
      viaturasMock,
      conferenciaEquipe,
      mapaForca as never,
    );
  });

  it('registrar persiste entry com timestamp + chama aplicarConferencia (override)', async () => {
    const r = await svc.registrar(
      dataIso,
      'ABTS 011',
      { vtrPrefixo: 'ABTS 011', kmAtual: 12345, estadoTanquePercent: 85, observacao: 'OK' },
      motoristaNf,
      true,
    );
    expect(r.kmAtual).toBe(12345);
    expect(r.estadoTanquePercent).toBe(85);
    expect(r.registradoPorNf).toBe(motoristaNf);
    expect(viaturasMock.aplicarConferencia).toHaveBeenCalled();
  });

  it('getByData retorna entries persistidas', async () => {
    await svc.registrar(
      dataIso,
      'ABTS 011',
      { vtrPrefixo: 'ABTS 011', estadoTanquePercent: 50 },
      motoristaNf,
      true,
    );
    expect(svc.getByData(dataIso)).toHaveLength(1);
  });

  it('mudança de status durante serviço cria AlteracaoDiversa', async () => {
    servico.iniciarPrevia(dataIso, motoristaNf, motoristaNf, true);
    servico.iniciar(dataIso, motoristaNf);
    // Confere equipe primeiro para liberar conferência da viatura.
    const conferenciaEquipe = new ConferenciaEquipeService(servico, mapaForca as never);
    await conferenciaEquipe.bulkUpdate(
      dataIso,
      {
        entries: [
          { recurso: 'ABTS_01', funcao: 'Ch', militarOriginalNf: '111', statusConferencia: 'presente' },
        ],
      },
      motoristaNf,
      true,
    );
    svc = new ConferenciaViaturaService(servico, viaturasMock, conferenciaEquipe, mapaForca as never);
    await svc.registrar(
      dataIso,
      'ABTS 011',
      {
        vtrPrefixo: 'ABTS 011',
        estadoTanquePercent: 30,
        statusMudanca: 'BAIXADA',
        motivoBaixa: 'Pneu estourou',
      },
      motoristaNf,
      true,
    );
    const alts = servico.listAlteracoes(dataIso);
    expect(alts).toHaveLength(1);
    expect(alts[0]?.tipo).toBe('mudanca_viatura');
    expect(alts[0]?.statusViaturaAnterior).toBe('DISPONIVEL');
    expect(alts[0]?.statusViaturaNovo).toBe('BAIXADA');
    expect(alts[0]?.motivo).toBe('Pneu estourou');
  });

  it('NÃO cria AlteracaoDiversa se status não mudou', async () => {
    servico.iniciarPrevia(dataIso, motoristaNf, motoristaNf, true);
    servico.iniciar(dataIso, motoristaNf);
    const conferenciaEquipe = new ConferenciaEquipeService(servico, mapaForca as never);
    await conferenciaEquipe.bulkUpdate(
      dataIso,
      {
        entries: [
          { recurso: 'ABTS_01', funcao: 'Ch', militarOriginalNf: '111', statusConferencia: 'presente' },
        ],
      },
      motoristaNf,
      true,
    );
    svc = new ConferenciaViaturaService(servico, viaturasMock, conferenciaEquipe, mapaForca as never);
    await svc.registrar(
      dataIso,
      'ABTS 011',
      { vtrPrefixo: 'ABTS 011', estadoTanquePercent: 80 },
      motoristaNf,
      true,
    );
    expect(servico.listAlteracoes(dataIso)).toHaveLength(0);
  });

  it('NÃO cria AlteracaoDiversa se Servico ainda NAO_INICIADO (mudança pré-turno)', async () => {
    await svc.registrar(
      dataIso,
      'ABTS 011',
      {
        vtrPrefixo: 'ABTS 011',
        estadoTanquePercent: 30,
        statusMudanca: 'BAIXADA',
        motivoBaixa: 'Pneu estourou',
      },
      motoristaNf,
      true,
    );
    expect(servico.listAlteracoes(dataIso)).toHaveLength(0);
  });

  // S6h/2.1 — gate: Conferência da Viatura exige Conferência da Equipe primeiro
  it('S6h — bloqueia (409) registrar viatura cuja equipe ainda NÃO foi conferida', async () => {
    servico.iniciarPrevia(dataIso, motoristaNf, motoristaNf, true);
    servico.iniciar(dataIso, motoristaNf);
    await expect(
      svc.registrar(
        dataIso,
        'ABTS 011',
        { vtrPrefixo: 'ABTS 011', estadoTanquePercent: 80 },
        motoristaNf,
        true,
      ),
    ).rejects.toThrow(/ABTS_01.*não foi conferida/i);
  });

  it('S6h — permite registrar viatura quando equipe foi conferida', async () => {
    servico.iniciarPrevia(dataIso, motoristaNf, motoristaNf, true);
    servico.iniciar(dataIso, motoristaNf);
    const conferenciaEquipe = new ConferenciaEquipeService(servico, mapaForca as never);
    await conferenciaEquipe.bulkUpdate(
      dataIso,
      {
        entries: [
          {
            recurso: 'ABTS_01',
            funcao: 'Ch',
            militarOriginalNf: '111',
            statusConferencia: 'presente',
          },
        ],
      },
      motoristaNf,
      true,
    );
    svc = new ConferenciaViaturaService(servico, viaturasMock, conferenciaEquipe, mapaForca as never);
    const r = await svc.registrar(
      dataIso,
      'ABTS 011',
      { vtrPrefixo: 'ABTS 011', estadoTanquePercent: 80 },
      motoristaNf,
      true,
    );
    expect(r.estadoTanquePercent).toBe(80);
  });

  // S0.x — Auto-promote para VIATURA_CONFERIDA
  it('S0.x — promove EQUIPE_CONFERIDA → VIATURA_CONFERIDA quando todas viaturas operacionais conferidas', async () => {
    servico.iniciarPrevia(dataIso, motoristaNf, motoristaNf, true);
    servico.iniciar(dataIso, motoristaNf);
    // Confere equipe ABTS_01 (única viatura DISPONIVEL no FakeMapaForca).
    const conferenciaEquipe = new ConferenciaEquipeService(servico, mapaForca as never);
    await conferenciaEquipe.bulkUpdate(
      dataIso,
      {
        entries: [
          {
            recurso: 'ABTS_01',
            funcao: 'Ch',
            militarOriginalNf: '111',
            statusConferencia: 'presente',
          },
        ],
      },
      motoristaNf,
      true,
    );
    expect(servico.get(dataIso).estado).toBe('EQUIPE_CONFERIDA');
    svc = new ConferenciaViaturaService(servico, viaturasMock, conferenciaEquipe, mapaForca as never);
    await svc.registrar(
      dataIso,
      'ABTS 011',
      { vtrPrefixo: 'ABTS 011', estadoTanquePercent: 80 },
      motoristaNf,
      true,
    );
    expect(servico.get(dataIso).estado).toBe('VIATURA_CONFERIDA');
  });
});
