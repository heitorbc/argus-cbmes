import { describe, it, expect } from 'vitest';
import type { EscalaEspecialMensal } from '@argus/shared-types';
import { formatEscalaEspecialParaWhatsapp } from './whatsapp-especial';

const escalaMock: EscalaEspecialMensal = {
  mes: 5,
  ano: 2026,
  origemArquivo: '05 - ESCALA ESPECIAL 1ª CIA - MAIO.xlsm',
  importadoEm: '2026-05-01T00:00:00Z',
  atos: [
    {
      data: '2026-05-01',
      militarRaw: 'SGT MARIANE',
      horario: '07:10 ÀS 13:10',
      funcao: 'APOIO',
    },
    {
      data: '2026-05-02',
      militarRaw: 'SD LOUREIRO',
      horario: '12:00 ÀS 18:00',
      funcao: 'APOIO',
    },
    {
      data: '2026-05-01',
      militarRaw: 'SGT BISSOLI',
      horario: '13:10 ÀS 19:10',
      funcao: 'APOIO',
    },
  ],
  avisos: [],
};

describe('formatEscalaEspecialParaWhatsapp (S6a/F1)', () => {
  it('inclui cabeçalho com mês e ano em maiúsculas', () => {
    const out = formatEscalaEspecialParaWhatsapp(escalaMock);
    expect(out).toContain('*ESCALA ESPECIAL — MAIO DE 2026*');
  });

  it('agrupa atos por data e inclui todos', () => {
    const out = formatEscalaEspecialParaWhatsapp(escalaMock);
    expect(out).toContain('*01/05/2026*');
    expect(out).toContain('*02/05/2026*');
    expect(out).toContain('SGT MARIANE — 07:10 ÀS 13:10 (APOIO)');
    expect(out).toContain('SGT BISSOLI — 13:10 ÀS 19:10 (APOIO)');
    expect(out).toContain('SD LOUREIRO — 12:00 ÀS 18:00 (APOIO)');
  });

  it('mostra rodapé com total e origem', () => {
    const out = formatEscalaEspecialParaWhatsapp(escalaMock);
    expect(out).toContain('Total: 3 atos especiais');
    expect(out).toContain('05 - ESCALA ESPECIAL 1ª CIA - MAIO.xlsm');
  });

  it('escala vazia não quebra', () => {
    const out = formatEscalaEspecialParaWhatsapp({ ...escalaMock, atos: [] });
    expect(out).toContain('*ESCALA ESPECIAL — MAIO DE 2026*');
    expect(out).toContain('Total: 0 atos');
  });
});
