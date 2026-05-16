import { describe, it, expect, beforeEach } from 'vitest';
import type { EscalaMensal, ServicoEstado } from '@argus/shared-types';
import { EscalasController } from './escalas.controller';
import { EscalasService } from './escalas.service';
import type { ServicoService } from '../servico/servico.service';

/**
 * Mock do ServicoService — todos os dias retornam NAO_INICIADO (não há
 * bloqueios). Tests específicos de bloqueio podem injetar um mock
 * próprio com estados específicos.
 */
function makeServicoMockSemBloqueio(): ServicoService {
  return {
    get: (data: string): ServicoEstado => ({ data, estado: 'NAO_INICIADO' }),
  } as unknown as ServicoService;
}

/**
 * Regressão (homologação 2026-05-13): o `POST /escalas/confirm` antes
 * usava um schema Zod inline que omitia `mergulho` e `salvamar`. Como
 * Zod com `.safeParse()` faz strip de campos não declarados, esses 2
 * sumiam silenciosamente entre preview → confirm → save → GET, e a
 * Sargenteação não exibia as sections aquáticas.
 *
 * Este teste garante que a persistência preserva ambos os campos.
 */
describe('EscalasController.confirm (homologação fix)', () => {
  let controller: EscalasController;
  let service: EscalasService;

  beforeEach(() => {
    service = new EscalasService();
    controller = new EscalasController(service, makeServicoMockSemBloqueio());
  });

  function fakeEscala(): EscalaMensal {
    return {
      mes: 5,
      ano: 2026,
      origemArquivo: '05 MAIO DE 2026.xlsx',
      importadoEm: '2026-05-08T00:00:00.000Z',
      diaEquipe: { '2026-05-01': 'C' },
      composicaoPorQuinzena: {
        q1: [
          {
            equipe: 'C',
            viatura: 'ABTS_01',
            funcao: 'Ch',
            militar: { raw: '2º SGT BARCELLOS', postoAbreviado: '2ºSGT', nomeGuerra: 'BARCELLOS' },
          },
        ],
        q2: [
          {
            equipe: 'C',
            viatura: 'ABTS_01',
            funcao: 'Ch',
            militar: { raw: '2º SGT BARCELLOS', postoAbreviado: '2ºSGT', nomeGuerra: 'BARCELLOS' },
          },
        ],
        ultimoDiaQ1: 14,
      },
      mergulho: {
        equipesPorQuinzena: {
          q1: {
            A: {
              letra: 'A',
              chefe: { raw: '2º SGT ALEXANDRE', postoAbreviado: '2ºSGT', nomeGuerra: 'ALEXANDRE' },
              motorista: null,
              mergulhadores: [],
            },
          },
          q2: {
            A: {
              letra: 'A',
              chefe: { raw: '2º SGT ALEXANDRE', postoAbreviado: '2ºSGT', nomeGuerra: 'ALEXANDRE' },
              motorista: null,
              mergulhadores: [],
            },
          },
          ultimoDiaQ1: 14,
        },
        porDia: { '2026-05-01': { mergulho01: 'A' } },
      },
      salvamar: {
        equipesPorQuinzena: {
          q1: {
            E: {
              letra: 'E',
              supervisores: [{ raw: '3º SGT DAN', postoAbreviado: '3ºSGT', nomeGuerra: 'DAN' }],
            },
          },
          q2: {
            E: {
              letra: 'E',
              supervisores: [{ raw: '3º SGT DAN', postoAbreviado: '3ºSGT', nomeGuerra: 'DAN' }],
            },
          },
          ultimoDiaQ1: 14,
        },
        porDia: { '2026-05-01': 'E' },
      },
      avisos: [],
    };
  }

  it('persiste mergulho e salvamar (não strippa pelo Zod)', () => {
    const body = fakeEscala();
    controller.confirm(body);
    const got = service.get(2026, 5);
    expect(got).toBeDefined();
    expect(got!.mergulho).toBeDefined();
    expect(got!.mergulho!.equipesPorQuinzena.q1.A?.chefe?.nomeGuerra).toBe('ALEXANDRE');
    expect(got!.mergulho!.equipesPorQuinzena.q2.A?.chefe?.nomeGuerra).toBe('ALEXANDRE');
    expect(got!.mergulho!.porDia['2026-05-01']?.mergulho01).toBe('A');
    expect(got!.salvamar).toBeDefined();
    expect(got!.salvamar!.equipesPorQuinzena.q1.E?.supervisores[0]?.nomeGuerra).toBe('DAN');
    expect(got!.salvamar!.porDia['2026-05-01']).toBe('E');
  });

  it('persiste escala sem mergulho/salvamar (campos opcionais)', () => {
    const body = fakeEscala();
    delete body.mergulho;
    delete body.salvamar;
    controller.confirm(body);
    const got = service.get(2026, 5);
    expect(got).toBeDefined();
    expect(got!.mergulho).toBeUndefined();
    expect(got!.salvamar).toBeUndefined();
  });
});
