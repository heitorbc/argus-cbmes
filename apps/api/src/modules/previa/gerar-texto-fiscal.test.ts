import { describe, it, expect } from 'vitest';
import { gerarTextoFiscalAtestadoIdeo } from '@argus/shared-types';

const fiscal = { posto: '2ºSGT', nomeGuerra: 'BARCELLOS', nf: '3037509' };

/**
 * S6i — Tests do helper `gerarTextoFiscalAtestadoIdeo` (`@argus/shared-types`).
 * Mantido em apps/api porque o package shared-types não tem vitest configurado.
 */
describe('gerarTextoFiscalAtestadoIdeo (S6i)', () => {
  it('retorna null sem fiscal', () => {
    expect(
      gerarTextoFiscalAtestadoIdeo(
        [
          { tipo: 'ABTS', realizada: true },
          { tipo: 'RESGATE', realizada: true },
        ],
        null,
      ),
    ).toBeNull();
  });

  it('retorna null quando faltam tipos (incompleto)', () => {
    expect(gerarTextoFiscalAtestadoIdeo([{ tipo: 'ABTS', realizada: true }], fiscal)).toBeNull();
  });

  it('caso A — tudo realizado: texto institucional ESTADO DE PRONTIDÃO', () => {
    const t = gerarTextoFiscalAtestadoIdeo(
      [
        { tipo: 'ABTS', realizada: true },
        { tipo: 'RESGATE', realizada: true },
      ],
      fiscal,
    );
    expect(t).toContain('Eu, 2ºSGT BARCELLOS, NF 3037509');
    expect(t).toContain('ESTADO DE PRONTIDÃO');
    expect(t).toContain('pronto emprego');
  });

  it('caso B — algum não realizado: texto descritivo com motivo', () => {
    const t = gerarTextoFiscalAtestadoIdeo(
      [
        { tipo: 'ABTS', realizada: true },
        { tipo: 'RESGATE', realizada: false, motivoNaoRealizacao: 'Viatura emprestada' },
      ],
      fiscal,
    );
    expect(t).toContain('IDEO RESGATE NÃO REALIZADA');
    expect(t).toContain('Viatura emprestada');
    expect(t).not.toContain('ESTADO DE PRONTIDÃO');
  });

  it('caso B — sem motivo informado usa fallback', () => {
    const t = gerarTextoFiscalAtestadoIdeo(
      [
        { tipo: 'ABTS', realizada: false },
        { tipo: 'RESGATE', realizada: true },
      ],
      fiscal,
    );
    expect(t).toContain('sem motivo informado');
  });
});
