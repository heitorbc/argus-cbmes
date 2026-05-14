import { describe, it, expect, beforeEach } from 'vitest';
import type { EscalaMensal } from '@argus/shared-types';
import { EscalasController } from './escalas.controller';
import { EscalasService } from './escalas.service';

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
    controller = new EscalasController(service);
  });

  function fakeEscala(): EscalaMensal {
    return {
      mes: 5,
      ano: 2026,
      origemArquivo: '05 MAIO DE 2026.xlsx',
      importadoEm: '2026-05-08T00:00:00.000Z',
      diaEquipe: { '2026-05-01': 'C' },
      composicao: [
        {
          equipe: 'C',
          viatura: 'ABTS_01',
          funcao: 'Ch',
          militar: { raw: '2º SGT BARCELLOS', postoAbreviado: '2ºSGT', nomeGuerra: 'BARCELLOS' },
        },
      ],
      mergulho: {
        equipes: {
          A: {
            letra: 'A',
            chefe: { raw: '2º SGT ALEXANDRE', postoAbreviado: '2ºSGT', nomeGuerra: 'ALEXANDRE' },
            motorista: null,
            mergulhadores: [],
          },
        },
        porDia: { '2026-05-01': { mergulho01: 'A' } },
      },
      salvamar: {
        equipes: {
          E: {
            letra: 'E',
            supervisores: [
              { raw: '3º SGT DAN', postoAbreviado: '3ºSGT', nomeGuerra: 'DAN' },
            ],
          },
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
    expect(got!.mergulho!.equipes.A?.chefe?.nomeGuerra).toBe('ALEXANDRE');
    expect(got!.mergulho!.porDia['2026-05-01']?.mergulho01).toBe('A');
    expect(got!.salvamar).toBeDefined();
    expect(got!.salvamar!.equipes.E?.supervisores[0]?.nomeGuerra).toBe('DAN');
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
