import { describe, it, expect } from 'vitest';
import type { EstadoServico, ServicoEstado } from '@argus/shared-types';
import { bloqueiosToMessage, computeBloqueios } from './bloqueio-reimport';
import type { ServicoService } from './servico.service';

/**
 * Mock minimal do `ServicoService.get` — só o que `computeBloqueios`
 * consome.
 */
function makeServicoMock(porData: Record<string, EstadoServico>): ServicoService {
  return {
    get: (data: string): ServicoEstado => ({
      data,
      estado: porData[data] ?? 'NAO_INICIADO',
    }),
  } as unknown as ServicoService;
}

describe('computeBloqueios', () => {
  it('lista vazia quando todos os dias estão NAO_INICIADO', () => {
    const svc = makeServicoMock({});
    const res = computeBloqueios(svc, ['2026-05-01', '2026-05-02', '2026-05-03']);
    expect(res).toEqual([]);
  });

  it('detecta dia com PREVIA_INICIADA', () => {
    const svc = makeServicoMock({ '2026-05-15': 'PREVIA_INICIADA' });
    const res = computeBloqueios(svc, ['2026-05-14', '2026-05-15', '2026-05-16']);
    expect(res.length).toBe(1);
    expect(res[0]).toMatchObject({
      data: '2026-05-15',
      estado: 'PREVIA_INICIADA',
      motivo: expect.stringContaining('Prévia iniciada'),
    });
  });

  it('detecta múltiplos estados em uso (INICIADO, EQUIPE_CONFERIDA, etc.)', () => {
    const svc = makeServicoMock({
      '2026-05-10': 'INICIADO',
      '2026-05-11': 'EQUIPE_CONFERIDA',
      '2026-05-12': 'VIATURA_CONFERIDA',
      '2026-05-13': 'PREENCHENDO_MF',
      '2026-05-14': 'ENCERRADO',
    });
    const res = computeBloqueios(svc, [
      '2026-05-10',
      '2026-05-11',
      '2026-05-12',
      '2026-05-13',
      '2026-05-14',
    ]);
    expect(res.length).toBe(5);
  });

  it('motivo "Serviço em andamento" para INICIADO+', () => {
    const svc = makeServicoMock({ '2026-05-15': 'INICIADO' });
    const res = computeBloqueios(svc, ['2026-05-15']);
    expect(res[0]?.motivo).toContain('Serviço em andamento');
  });

  it('motivo específico para ENCERRADO', () => {
    const svc = makeServicoMock({ '2026-05-15': 'ENCERRADO' });
    const res = computeBloqueios(svc, ['2026-05-15']);
    expect(res[0]?.motivo).toContain('encerrado');
  });

  it('ordena bloqueios por data crescente', () => {
    const svc = makeServicoMock({
      '2026-05-15': 'PREVIA_INICIADA',
      '2026-05-10': 'INICIADO',
      '2026-05-20': 'ENCERRADO',
    });
    const res = computeBloqueios(svc, ['2026-05-15', '2026-05-10', '2026-05-20']);
    expect(res.map((b) => b.data)).toEqual(['2026-05-10', '2026-05-15', '2026-05-20']);
  });
});

describe('bloqueiosToMessage', () => {
  it('vazia se sem bloqueios', () => {
    expect(bloqueiosToMessage([])).toBe('');
  });

  it('1 bloqueio: detalhe do dia', () => {
    const msg = bloqueiosToMessage([
      { data: '2026-05-15', estado: 'PREVIA_INICIADA', motivo: 'Prévia iniciada' },
    ]);
    expect(msg).toContain('2026-05-15');
    expect(msg).toContain('Prévia iniciada');
  });

  it('múltiplos bloqueios: contagem + primeiro dia', () => {
    const msg = bloqueiosToMessage([
      { data: '2026-05-10', estado: 'INICIADO', motivo: 'X' },
      { data: '2026-05-15', estado: 'PREVIA_INICIADA', motivo: 'Y' },
    ]);
    expect(msg).toContain('2 dias');
    expect(msg).toContain('2026-05-10');
  });
});
