import { describe, it, expect, beforeEach } from 'vitest';
import { IncidentesBaonService } from './incidentes-baon.service';

describe('IncidentesBaonService', () => {
  let svc: IncidentesBaonService;

  beforeEach(() => {
    svc = new IncidentesBaonService();
    svc.reset([
      { codigo: 'Q', descricao: 'INCENDIO', classificacao: 'CRIMINAL' },
      { codigo: 'Q01', descricao: 'INCENDIO: EM RESIDENCIA', classificacao: 'CRIMINAL' },
      {
        codigo: 'Q01A01',
        descricao: 'INCENDIO: EM RESIDENCIA: CONGLOMERADO DE EDIFICACOES: DE MADEIRA',
        classificacao: 'CRIMINAL',
      },
      {
        codigo: 'M01E',
        descricao: 'ATENDIMENTO PRÉ-HOSPITALAR: À VÍTIMA DE TRAUMA: POR ESPANCAMENTO',
        classificacao: 'RESGATE',
      },
      { codigo: 'R08', descricao: 'PREVENÇÃO BOMBEIRO: SALVAMAR', classificacao: 'PREVENCIONAL' },
    ]);
  });

  it('search por código (prefixo) retorna todos os filhos', () => {
    const hits = svc.search('Q01');
    expect(hits.map((h) => h.codigo)).toEqual(expect.arrayContaining(['Q01', 'Q01A01']));
  });

  it('search por descrição (contém) é case-insensitive e ignora acentos', () => {
    const hits = svc.search('vitima');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.codigo).toBe('M01E');
  });

  it('search vazio retorna primeiros N items', () => {
    const hits = svc.search('', 3);
    expect(hits.length).toBe(3);
  });

  it('search respeita limit', () => {
    const hits = svc.search('', 2);
    expect(hits.length).toBe(2);
  });

  it('findByCodigo encontra exato (case-insensitive)', () => {
    expect(svc.findByCodigo('q01a01')?.codigo).toBe('Q01A01');
    expect(svc.findByCodigo('inexistente')).toBeNull();
  });
});
