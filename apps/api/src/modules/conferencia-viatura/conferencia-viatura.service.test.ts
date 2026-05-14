import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Viatura } from '@argus/shared-types';
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
    criadoEm: now,
    atualizadoEm: now,
  };
}

describe('ConferenciaViaturaService', () => {
  let svc: ConferenciaViaturaService;
  let viaturasMock: ViaturasService;
  let servico: ServicoService;
  let viaturaAtual: Viatura;

  beforeEach(() => {
    servico = new ServicoService();
    viaturaAtual = viatura('ABTS 011');
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
    const conferenciaEquipe = new ConferenciaEquipeService(servico);
    svc = new ConferenciaViaturaService(servico, viaturasMock, conferenciaEquipe);
  });

  it('registrar persiste entry com timestamp + chama aplicarConferencia', async () => {
    const r = await svc.registrar(
      dataIso,
      'ABTS 011',
      { vtrPrefixo: 'ABTS 011', kmAtual: 12345, estadoTanquePercent: 85, observacao: 'OK' },
      motoristaNf,
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
    );
    expect(svc.getByData(dataIso)).toHaveLength(1);
  });

  it('mudança de status durante serviço cria AlteracaoDiversa', async () => {
    servico.iniciarPrevia(dataIso, motoristaNf, motoristaNf, true); servico.iniciar(dataIso, motoristaNf);
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
    );
    const alts = servico.listAlteracoes(dataIso);
    expect(alts).toHaveLength(1);
    expect(alts[0]?.tipo).toBe('mudanca_viatura');
    expect(alts[0]?.statusViaturaAnterior).toBe('DISPONIVEL');
    expect(alts[0]?.statusViaturaNovo).toBe('BAIXADA');
    expect(alts[0]?.motivo).toBe('Pneu estourou');
  });

  it('NÃO cria AlteracaoDiversa se status não mudou', async () => {
    servico.iniciarPrevia(dataIso, motoristaNf, motoristaNf, true); servico.iniciar(dataIso, motoristaNf);
    await svc.registrar(
      dataIso,
      'ABTS 011',
      { vtrPrefixo: 'ABTS 011', estadoTanquePercent: 80 },
      motoristaNf,
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
    );
    expect(servico.listAlteracoes(dataIso)).toHaveLength(0);
  });

  // S6h/2.1 — gate: Conferência da Viatura exige Conferência da Equipe primeiro
  it('S6h — bloqueia (409) registrar viatura cuja equipe ainda NÃO foi conferida', async () => {
    // Viatura associada ao recurso ABTS_01 via funcaoOperacional
    viaturaAtual = { ...viatura('ABTS 011'), funcaoOperacional: 'ABTS_01' };
    servico.iniciarPrevia(dataIso, motoristaNf, motoristaNf, true); servico.iniciar(dataIso, motoristaNf);
    // Equipe ABTS_01 ainda não foi conferida — gate deve bloquear
    await expect(
      svc.registrar(
        dataIso,
        'ABTS 011',
        { vtrPrefixo: 'ABTS 011', estadoTanquePercent: 80 },
        motoristaNf,
      ),
    ).rejects.toThrow(/ABTS_01.*não foi conferida/i);
  });

  it('S6h — permite registrar viatura quando equipe foi conferida', async () => {
    viaturaAtual = { ...viatura('ABTS 011'), funcaoOperacional: 'ABTS_01' };
    servico.iniciarPrevia(dataIso, motoristaNf, motoristaNf, true); servico.iniciar(dataIso, motoristaNf);
    // Confere a equipe ABTS_01 primeiro
    const conferenciaEquipe = new ConferenciaEquipeService(servico);
    conferenciaEquipe.bulkUpdate(
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
    );
    // Recria svc com a mesma instância da conferenciaEquipe que tem a marcação
    svc = new ConferenciaViaturaService(servico, viaturasMock, conferenciaEquipe);
    // Agora deve passar
    const r = await svc.registrar(
      dataIso,
      'ABTS 011',
      { vtrPrefixo: 'ABTS 011', estadoTanquePercent: 80 },
      motoristaNf,
    );
    expect(r.estadoTanquePercent).toBe(80);
  });
});
