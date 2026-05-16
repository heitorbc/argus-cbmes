import { describe, it, expect } from 'vitest';
import type { EscalaEspecialMensal, EscalaMensal, NotaServico } from '@argus/shared-types';
import {
  escalaEspecialToRows,
  escalaMensalToRows,
  notaServicoToRow,
  rowToNotaServico,
} from './sheets-db-serializers';

const escalaMensalBase: EscalaMensal = {
  ano: 2026,
  mes: 5,
  origemArquivo: 'maio.xlsx',
  importadoEm: '2026-04-30T10:00:00.000Z',
  importadoPorNf: '3037509',
  diaEquipe: {
    '2026-05-01': 'A',
    '2026-05-02': 'B',
    '2026-05-15': 'C',
  },
  composicaoPorQuinzena: {
    ultimoDiaQ1: 14,
    q1: [
      {
        equipe: 'A',
        viatura: 'ABTS_01',
        funcao: 'Motorista',
        militar: {
          raw: '2ºSGT BARCELLOS',
          postoAbreviado: '2ºSGT',
          nomeGuerra: 'BARCELLOS',
          nf: '3037509',
        },
      },
      {
        equipe: 'B',
        viatura: 'ABTS_02',
        funcao: 'Motorista',
        militar: { raw: 'CB FLEGLER', postoAbreviado: 'CB', nomeGuerra: 'FLEGLER', nf: '4150600' },
      },
    ],
    q2: [
      {
        equipe: 'C',
        viatura: 'ABTS_01',
        funcao: 'Operador',
        militar: { raw: 'SD RITA', postoAbreviado: 'SD', nomeGuerra: 'RITA' },
      },
    ],
  },
  avisos: [],
};

describe('escalaMensalToRows', () => {
  it('gera 1 linha por (data × militar escalado naquele dia)', () => {
    const rows = escalaMensalToRows(escalaMensalBase);
    // 01/05 (eq A, q1) → 1 entry; 02/05 (eq B, q1) → 1 entry; 15/05 (eq C, q2) → 1 entry
    expect(rows.length).toBe(3);
  });

  it('preserva campos originais e desnormaliza data/equipe/militar', () => {
    const rows = escalaMensalToRows(escalaMensalBase);
    const linhaBarcellos = rows.find((r) => r[8] === '3037509');
    expect(linhaBarcellos).toBeDefined();
    expect(linhaBarcellos).toEqual([
      '2026',
      '5',
      '2026-05-01',
      'A',
      'ABTS_01', // recurso ≈ viatura
      'ABTS_01',
      'Motorista',
      '2ºSGT BARCELLOS',
      '3037509',
      'maio.xlsx',
      '2026-04-30T10:00:00.000Z',
      '3037509',
    ]);
  });

  it('militar sem NF resolvida → coluna NF vazia', () => {
    const rows = escalaMensalToRows(escalaMensalBase);
    const linhaRita = rows.find((r) => r[7] === 'SD RITA');
    expect(linhaRita?.[8]).toBe('');
  });

  it('dia sem equipe atribuída é ignorado', () => {
    const escala = {
      ...escalaMensalBase,
      diaEquipe: { '2026-05-01': 'A' as const, '2026-05-03': null as unknown as 'A' },
    };
    const rows = escalaMensalToRows(escala);
    expect(rows.length).toBe(1);
  });
});

describe('escalaEspecialToRows', () => {
  it('cada ato vira 1 linha com 10 colunas', () => {
    const escala: EscalaEspecialMensal = {
      ano: 2026,
      mes: 5,
      origemArquivo: 'esp.xlsm',
      importadoEm: '2026-04-30T10:00:00.000Z',
      importadoPorNf: '3037509',
      atos: [
        {
          data: '2026-05-10',
          militarRaw: 'CB FABRE',
          militarNf: '3055566',
          horario: '07:10 ÀS 13:10',
          funcao: 'APOIO',
        },
        {
          data: '2026-05-12',
          militarRaw: 'SD MILITAR',
          horario: '13:10 ÀS 19:10',
          funcao: 'FISCAL DE EVENTO',
        },
      ],
      avisos: [],
    };
    const rows = escalaEspecialToRows(escala);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual([
      '2026',
      '5',
      '2026-05-10',
      'CB FABRE',
      '3055566',
      '07:10 ÀS 13:10',
      'APOIO',
      'esp.xlsm',
      '2026-04-30T10:00:00.000Z',
      '3037509',
    ]);
    expect(rows[1]?.[4]).toBe(''); // sem NF resolvida
  });
});

describe('notaServicoToRow / rowToNotaServico (round-trip)', () => {
  const ns: NotaServico = {
    id: 'ns:abc-123',
    codigo: 'NS001',
    descricao: 'Apoio à Pró-Matre',
    data: '2026-05-15',
    horaInicio: '07:00',
    horaFim: '19:00',
    viaturaPrefixo: 'AU 154',
    militaresNfs: ['3037509', '4150600'],
    observacoes: 'Sem alterações',
    criadoEm: '2026-05-14T20:00:00.000Z',
    criadoPorNf: '3037509',
  };

  it('serializa com 11 colunas', () => {
    const row = notaServicoToRow(ns);
    expect(row.length).toBe(11);
    expect(row[0]).toBe('ns:abc-123');
    expect(row[7]).toBe('3037509|4150600'); // militaresNfs join
  });

  it('round-trip preserva todos os campos não-vazios', () => {
    const row = notaServicoToRow(ns);
    const parsed = rowToNotaServico(row);
    expect(parsed).toEqual(ns);
  });

  it('rowToNotaServico lida com campos opcionais vazios', () => {
    const minimal: NotaServico = {
      ...ns,
      viaturaPrefixo: undefined,
      observacoes: undefined,
    };
    const row = notaServicoToRow(minimal);
    const parsed = rowToNotaServico(row);
    expect(parsed?.viaturaPrefixo).toBeUndefined();
    expect(parsed?.observacoes).toBeUndefined();
    expect(parsed?.militaresNfs).toEqual(['3037509', '4150600']);
  });

  it('rowToNotaServico retorna null para linha truncada', () => {
    expect(rowToNotaServico(['ns:x'])).toBeNull();
  });

  it('rowToNotaServico retorna null sem id', () => {
    const row = notaServicoToRow(ns);
    row[0] = '';
    expect(rowToNotaServico(row)).toBeNull();
  });
});
