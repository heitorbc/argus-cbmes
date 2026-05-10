import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseNotaServicoPdf } from './nota-servico-pdf-parser';

/**
 * S6m — Tests do parser usando PDFs reais (gitignored em data/).
 *
 * Os PDFs vivem em `data/Nota de Serviço/` (não versionados). Cada teste
 * carrega um arquivo específico para validar o parser contra layout real.
 *
 * Se algum PDF não estiver presente (CI sem `data/`), o test usa
 * `it.skipIf` em vez de falhar.
 */
const DATA_DIR = resolve(__dirname, '../../../../../data/Nota de Serviço');

function loadPdf(filename: string): Buffer | null {
  try {
    return readFileSync(resolve(DATA_DIR, filename));
  } catch {
    return null;
  }
}

describe('parseNotaServicoPdf (S6m)', () => {
  const ns002 = loadPdf('NS002 - ISEO - Coleta leite materno - Pró-Matre.pdf');

  it.skipIf(!ns002)(
    'NS002 — extrai código NS002, finalidade contém "Pró-Matre", 4 NFs distintos',
    async () => {
      const r = await parseNotaServicoPdf(ns002!);
      expect(r.codigoSugerido).toBe('NS002');
      expect(r.descricaoSugerida).toMatch(/Pró-Matre/i);
      // 4 militares no Anexo I + possivelmente NF do que assina (ignorado se for 6/8 dígitos)
      expect(r.militaresNfs.length).toBeGreaterThanOrEqual(4);
      expect(r.militaresNfs).toContain('3699374'); // SD RODRIGO NORONHA SCALZER LOPES
      expect(r.militaresNfs).toContain('3369986'); // CB ELSON GATTO NOGUEIRA DA SILVA
      expect(r.militaresNfs).toContain('3068412'); // CB ROMULO EUSTAQUIO
      expect(r.militaresNfs).toContain('4151364'); // CB HENRIQUE LOPES PEREIRA
    },
  );

  it.skipIf(!ns002)('NS002 — sugere horário 07:00 às 13:00', async () => {
    const r = await parseNotaServicoPdf(ns002!);
    expect(r.horaInicioSugerida).toBe('07:00');
    expect(r.horaFimSugerida).toBe('13:00');
  });

  it.skipIf(!ns002)('NS002 — viatura sugerida AU_302', async () => {
    const r = await parseNotaServicoPdf(ns002!);
    expect(r.viaturaSugerida).toMatch(/AU.?302/);
  });

  it.skipIf(!ns002)(
    'NS002 — múltiplas datas → sugere a primeira (2026-01-08) com aviso',
    async () => {
      const r = await parseNotaServicoPdf(ns002!);
      expect(r.dataSugerida).toBe('2026-01-08');
      expect(r.avisos.some((a) => /Múltiplas datas/i.test(a))).toBe(true);
    },
  );

  const ns001 = loadPdf('NS001 - ISEO - Campeonato Estadual de Judô.pdf');

  it.skipIf(!ns001)(
    'NS001 — código NS001 + descrição contém "Judô" + ≥9 NFs (3 grupos × 3 militares)',
    async () => {
      const r = await parseNotaServicoPdf(ns001!);
      expect(r.codigoSugerido).toBe('NS001');
      expect(r.descricaoSugerida).toMatch(/Jud[oô]/i);
      expect(r.militaresNfs.length).toBeGreaterThanOrEqual(9);
    },
  );

  it('lança erro útil em PDF inválido', async () => {
    const fake = Buffer.from('isto não é um PDF', 'utf8');
    await expect(parseNotaServicoPdf(fake)).rejects.toThrow();
  });
});
