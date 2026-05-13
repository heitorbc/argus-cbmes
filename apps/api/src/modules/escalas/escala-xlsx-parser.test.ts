import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  EscalaXlsxParseError,
  expandViaturaFuncao,
  parseEscalaXlsx,
  parseFilename,
  parseMilitarCell,
} from './escala-xlsx-parser';

const FIXTURES_DIR = resolve(__dirname, '..', '..', '..', '..', '..', 'data', 'Escala de Serviço');

function loadFixture(filename: string): Buffer {
  return readFileSync(resolve(FIXTURES_DIR, filename));
}

describe('parseFilename', () => {
  it('reconhece nomes padrão "MM MES DE AAAA"', () => {
    expect(parseFilename('05 MAIO DE 2026.xlsx')).toEqual({ mes: 5, ano: 2026 });
    expect(parseFilename('04 ABRIL DE 2026.xlsx')).toEqual({ mes: 4, ano: 2026 });
    expect(parseFilename('06 JUNHO DE 2026.xlsx')).toEqual({ mes: 6, ano: 2026 });
    expect(parseFilename('03 MARÇO DE 2026.xlsx')).toEqual({ mes: 3, ano: 2026 });
  });

  it('aceita variantes mid-month/parcial preservando mês', () => {
    expect(parseFilename('02 FEVEREIRO DE 2026 - apos mergulho voltar.xlsx')).toEqual({
      mes: 2,
      ano: 2026,
    });
    expect(parseFilename('05 MAIO DE 2026 11 A 15.xlsx')).toEqual({ mes: 5, ano: 2026 });
  });

  it('rejeita arquivos sem mês reconhecível', () => {
    expect(() => parseFilename('PROVA CHS.xlsx')).toThrow(EscalaXlsxParseError);
    expect(() => parseFilename('dia da mulher.xlsx')).toThrow(EscalaXlsxParseError);
  });

  it('rejeita arquivos sem ano', () => {
    expect(() => parseFilename('MAIO sem ano.xlsx')).toThrow(EscalaXlsxParseError);
  });
});

describe('parseMilitarCell', () => {
  it('reconhece padrão posto+nomeGuerra', () => {
    expect(parseMilitarCell('2º SGT JULIO')).toMatchObject({
      postoAbreviado: '2ºSGT',
      nomeGuerra: 'JULIO',
    });
    expect(parseMilitarCell('CB FABRE')).toMatchObject({
      postoAbreviado: 'CB',
      nomeGuerra: 'FABRE',
    });
    expect(parseMilitarCell('SD MARTINELLI')).toMatchObject({
      postoAbreviado: 'SD',
      nomeGuerra: 'MARTINELLI',
    });
    expect(parseMilitarCell('1º SGT HEVERTON')).toMatchObject({
      postoAbreviado: '1ºSGT',
      nomeGuerra: 'HEVERTON',
    });
  });

  it('descarta células vazias e placeholders', () => {
    expect(parseMilitarCell('')).toBeNull();
    expect(parseMilitarCell('--')).toBeNull();
    expect(parseMilitarCell('-')).toBeNull();
  });

  it('preserva nomes compostos no campo nomeGuerra', () => {
    expect(parseMilitarCell('CB ANDRE LUIS')).toMatchObject({
      postoAbreviado: 'CB',
      nomeGuerra: 'ANDRE LUIS',
    });
  });
});

describe('parseEscalaXlsx (fixture: 05 MAIO 2026)', () => {
  it('reconhece estrutura canônica com 4 equipes e dias 1-29', async () => {
    const buffer = loadFixture('05 MAIO DE 2026.xlsx');
    const escala = await parseEscalaXlsx({
      buffer,
      filename: '05 MAIO DE 2026.xlsx',
    });
    expect(escala.mes).toBe(5);
    expect(escala.ano).toBe(2026);

    // 14 + 15 = 29 dias, ou um pouco menos se algum dia ficou sem letra
    const dias = Object.keys(escala.diaEquipe);
    expect(dias.length).toBeGreaterThanOrEqual(20);

    // Equipes presentes
    const equipes = new Set(Object.values(escala.diaEquipe));
    expect(equipes.has('A')).toBe(true);
    expect(equipes.has('B')).toBe(true);
    expect(equipes.has('C')).toBe(true);
    expect(equipes.has('D')).toBe(true);
  });

  it('extrai composição de equipe CHARLIE com BARCELLOS como Ch ABTS', async () => {
    const buffer = loadFixture('05 MAIO DE 2026.xlsx');
    const escala = await parseEscalaXlsx({ buffer, filename: '05 MAIO DE 2026.xlsx' });

    const charlie = escala.composicao.filter((c) => c.equipe === 'C');
    expect(charlie.length).toBeGreaterThan(0);

    const chAbts = charlie.find((c) => /ABTS/i.test(c.viatura) && /^Ch$/i.test(c.funcao.trim()));
    expect(chAbts).toBeDefined();
    expect(chAbts!.militar.nomeGuerra).toMatch(/BARCELL/);
  });

  it('extrai composição de equipe ALFA com FABRE como Op 1 ABTS', async () => {
    const buffer = loadFixture('05 MAIO DE 2026.xlsx');
    const escala = await parseEscalaXlsx({ buffer, filename: '05 MAIO DE 2026.xlsx' });

    const alfa = escala.composicao.filter((c) => c.equipe === 'A');
    const op1 = alfa.find((c) => /ABTS/i.test(c.viatura) && /Op\s*1/i.test(c.funcao));
    expect(op1).toBeDefined();
    expect(op1!.militar.nomeGuerra).toBe('FABRE');
  });

  // F3a (S5) — Bug fix: 3 sentinelas da GUARDA têm a mesma funcao "Sent." no XLSX, e
  // o mergeComposicao colapsava por chave equipe|viatura|funcao. Solução: renumerar
  // como "Sent. 1", "Sent. 2", "Sent. 3" durante o parse.
  it('preserva 3 sentinelas distintos por equipe (Sent. 1/2/3) — F3a', async () => {
    const buffer = loadFixture('05 MAIO DE 2026.xlsx');
    const escala = await parseEscalaXlsx({ buffer, filename: '05 MAIO DE 2026.xlsx' });

    for (const equipe of ['A', 'B', 'C', 'D'] as const) {
      const guarda = escala.composicao.filter((c) => c.equipe === equipe && c.viatura === 'GUARDA');
      expect(guarda.length, `${equipe} deveria ter 3 sentinelas`).toBe(3);
      const funcoes = new Set(guarda.map((g) => g.funcao));
      expect(funcoes.size, `${equipe} deveria ter 3 funções únicas`).toBe(3);
      // Esperamos "Sent. 1", "Sent. 2", "Sent. 3"
      expect([...funcoes].sort()).toEqual(['Sent. 1', 'Sent. 2', 'Sent. 3']);
    }
  });
});

describe('parseEscalaXlsx (fixture: 04 ABRIL 2026)', () => {
  it('reconhece estrutura mensal sem erros', async () => {
    const buffer = loadFixture('04 ABRIL DE 2026.xlsx');
    const escala = await parseEscalaXlsx({ buffer, filename: '04 ABRIL DE 2026.xlsx' });
    expect(escala.mes).toBe(4);
    expect(escala.ano).toBe(2026);
    expect(Object.keys(escala.diaEquipe).length).toBeGreaterThanOrEqual(20);
    expect(escala.composicao.length).toBeGreaterThan(20);
  });
});

describe('parseEscalaXlsx (fixture: 06 JUNHO 2026)', () => {
  it('reconhece estrutura mensal sem erros', async () => {
    const buffer = loadFixture('06 JUNHO DE 2026.xlsx');
    const escala = await parseEscalaXlsx({ buffer, filename: '06 JUNHO DE 2026.xlsx' });
    expect(escala.mes).toBe(6);
    expect(escala.ano).toBe(2026);
    expect(Object.keys(escala.diaEquipe).length).toBeGreaterThanOrEqual(20);
  });
});

describe('parseEscalaXlsx — rejeição de não-escalas', () => {
  it('rejeita PROVA CHS.xlsx pelo nome', async () => {
    const buffer = loadFixture('PROVA CHS.xlsx');
    await expect(parseEscalaXlsx({ buffer, filename: 'PROVA CHS.xlsx' })).rejects.toThrow(
      /não contém/,
    );
  });

  it('rejeita "dia da mulher.xlsx" pelo nome', async () => {
    const buffer = loadFixture('dia da mulher.xlsx');
    await expect(parseEscalaXlsx({ buffer, filename: 'dia da mulher.xlsx' })).rejects.toThrow(
      /não contém/,
    );
  });
});

describe('parseEscalaXlsx — reupload parcial', () => {
  it('05 MAIO 11 A 15 também é parseado e retorna mes=5/ano=2026', async () => {
    const buffer = loadFixture('05 MAIO DE 2026 11 A 15.xlsx');
    const escala = await parseEscalaXlsx({
      buffer,
      filename: '05 MAIO DE 2026 11 A 15.xlsx',
    });
    expect(escala.mes).toBe(5);
    expect(escala.ano).toBe(2026);
  });
});

describe('expandViaturaFuncao (S6n-fix)', () => {
  it('"ABTS 01" normaliza para "ABTS_01" mantendo funcao', () => {
    expect(expandViaturaFuncao('ABTS 01', 'Ch')).toEqual([{ viatura: 'ABTS_01', funcao: 'Ch' }]);
    expect(expandViaturaFuncao('ABTS 02', 'Mot')).toEqual([{ viatura: 'ABTS_02', funcao: 'Mot' }]);
  });

  it('"RESGATE" (singular) mapeia para "RESGATE 01"', () => {
    expect(expandViaturaFuncao('RESGATE', 'Ch')).toEqual([{ viatura: 'RESGATE 01', funcao: 'Ch' }]);
  });

  it('"MOT CH OP" vira "CHEFE DE OPERAÇÕES" funcao "Mot" (motorista do Chefe)', () => {
    expect(expandViaturaFuncao('MOT CH OP', 'MOT CH OP')).toEqual([
      { viatura: 'CHEFE DE OPERAÇÕES', funcao: 'Mot' },
    ]);
  });

  it('"ATB e Plat." expande em ATB + PLATAFORMA, ambos com funcao "Mot"', () => {
    expect(expandViaturaFuncao('ATB e Plat.', 'Ch/Mot')).toEqual([
      { viatura: 'ATB', funcao: 'Mot' },
      { viatura: 'PLATAFORMA', funcao: 'Mot' },
    ]);
    expect(expandViaturaFuncao('ATB E PLAT', 'Ch/Mot')).toEqual([
      { viatura: 'ATB', funcao: 'Mot' },
      { viatura: 'PLATAFORMA', funcao: 'Mot' },
    ]);
  });

  it('viaturas sem alias (ex.: GUARDA, FLORESTAL) passam intactas', () => {
    expect(expandViaturaFuncao('GUARDA', 'Sent.')).toEqual([
      { viatura: 'GUARDA', funcao: 'Sent.' },
    ]);
    expect(expandViaturaFuncao('FLORESTAL', 'Ch')).toEqual([
      { viatura: 'FLORESTAL', funcao: 'Ch' },
    ]);
  });
});

describe('parseEscalaXlsx — Mergulho (S0.3, fixture 01 JANEIRO 2026)', () => {
  it('extrai cadastro de 3 equipes (A/B/C) com 4 militares cada', async () => {
    let buffer: Buffer;
    try {
      buffer = loadFixture('01 JANEIRO DE 2026.xlsx');
    } catch {
      return;
    }
    const escala = await parseEscalaXlsx({
      buffer,
      filename: '01 JANEIRO DE 2026.xlsx',
    });
    expect(escala.mergulho).toBeDefined();
    const equipes = escala.mergulho!.equipes;
    expect(Object.keys(equipes).sort()).toEqual(['A', 'B', 'C']);

    // Equipe A: 2º SGT ALEXANDRE (chefe), CB BEATRIZ (mot), CB VINICIUS + CB JACQUES (mergulhadores)
    expect(equipes.A!.chefe?.nomeGuerra).toContain('ALEXANDR');
    expect(equipes.A!.motorista?.nomeGuerra).toContain('BEATRIZ');
    expect(equipes.A!.mergulhadores).toHaveLength(2);

    // Equipe B: SGT RHUAN (chefe), CB VAZ (mot), SD MARCHESI + CB ELEUTERIO
    expect(equipes.B!.chefe?.nomeGuerra).toContain('RHUAN');
    expect(equipes.B!.motorista?.nomeGuerra).toContain('VAZ');

    // Equipe C: SGT RAFAEL (chefe), CB ALVARENGA (mot), SD PELICIONI + CB FABRE
    expect(equipes.C!.chefe?.nomeGuerra).toContain('RAFAEL');
    expect(equipes.C!.motorista?.nomeGuerra).toContain('ALVARENGA');
  });

  it('preenche porDia para os dias do mês com schedule de mergulho', async () => {
    let buffer: Buffer;
    try {
      buffer = loadFixture('01 JANEIRO DE 2026.xlsx');
    } catch {
      return;
    }
    const escala = await parseEscalaXlsx({
      buffer,
      filename: '01 JANEIRO DE 2026.xlsx',
    });
    const porDia = escala.mergulho!.porDia;
    // Espera pelo menos 1 dia com schedule completo
    const datasComMergulho = Object.entries(porDia).filter(
      ([, v]) => v.mergulho01 !== undefined || v.mergulho02 !== undefined,
    );
    expect(datasComMergulho.length).toBeGreaterThan(0);

    // Cada letra mapeada deve ser A/B/C (não vazar A1/A2/etc).
    for (const [, v] of datasComMergulho) {
      if (v.mergulho01) expect(['A', 'B', 'C']).toContain(v.mergulho01);
      if (v.mergulho02) expect(['A', 'B', 'C']).toContain(v.mergulho02);
    }
  });
});

describe('parseEscalaXlsx — Salvamar (S0.4, fixture 01 JANEIRO 2026)', () => {
  it('extrai cadastro de 2 equipes (E/F) com seus supervisores', async () => {
    let buffer: Buffer;
    try {
      buffer = loadFixture('01 JANEIRO DE 2026.xlsx');
    } catch {
      return;
    }
    const escala = await parseEscalaXlsx({
      buffer,
      filename: '01 JANEIRO DE 2026.xlsx',
    });
    expect(escala.salvamar).toBeDefined();
    const equipes = escala.salvamar!.equipes;
    expect(Object.keys(equipes).sort()).toEqual(['E', 'F']);

    // Equipe E: 3º SGT DAN (sup1, sup2 vazio na fixture)
    expect(equipes.E!.supervisores.length).toBeGreaterThanOrEqual(1);
    expect(equipes.E!.supervisores[0]!.nomeGuerra).toContain('DAN');

    // Equipe F: ao menos 1 supervisor cadastrado (CHAGAS na 1ª quinzena
    // / PAGANOTTO na 2ª — mergeSalvamar mantém a 1ª).
    expect(equipes.F!.supervisores.length).toBeGreaterThanOrEqual(1);
  });

  it('preenche porDia para dias do mês com letra E ou F', async () => {
    let buffer: Buffer;
    try {
      buffer = loadFixture('01 JANEIRO DE 2026.xlsx');
    } catch {
      return;
    }
    const escala = await parseEscalaXlsx({
      buffer,
      filename: '01 JANEIRO DE 2026.xlsx',
    });
    const porDia = escala.salvamar!.porDia;
    const datas = Object.keys(porDia);
    expect(datas.length).toBeGreaterThan(0);

    for (const data of datas) {
      expect(['E', 'F']).toContain(porDia[data]);
    }
  });
});

describe('parseEscalaXlsx — bug import dia 01 (S0.1-fix homologação)', () => {
  it('inclui o dia 01 do mês no diaEquipe (col B, antes da col EQUIPE A)', async () => {
    let buffer: Buffer;
    try {
      buffer = loadFixture('05 MAIO DE 2026.xlsx');
    } catch {
      return;
    }
    const escala = await parseEscalaXlsx({
      buffer,
      filename: '05 MAIO DE 2026.xlsx',
    });
    // Antes do fix: dia 01 (col B) ficava fora do range porque equipeCols
    // começa na col 3 (EQUIPE A). Com o fix, startCol = colsList[0] - 1.
    expect(escala.diaEquipe['2026-05-01']).toBeDefined();
    expect(escala.diaEquipe['2026-05-01']).toBe('C'); // sexta 01/05 = CHARLIE
    // E dia 15 (col B da 2ª quinzena) também.
    expect(escala.diaEquipe['2026-05-15']).toBeDefined();
    expect(escala.diaEquipe['2026-05-15']).toBe('A');
    // O mês todo deve estar mapeado (31 dias de maio).
    expect(Object.keys(escala.diaEquipe).length).toBe(31);
  });
});

describe('parseEscalaXlsx — fixture 01 JANEIRO 2026 com normalização (S6n-fix)', () => {
  it('emite recursos canônicos (ABTS_01, RESGATE 01, ATB, PLATAFORMA, CHEFE DE OPERAÇÕES, GUARDA)', async () => {
    let buffer: Buffer;
    try {
      buffer = loadFixture('01 JANEIRO DE 2026.xlsx');
    } catch {
      // Skip se fixture não existe localmente (CI sem data/).
      return;
    }
    const escala = await parseEscalaXlsx({
      buffer,
      filename: '01 JANEIRO DE 2026.xlsx',
    });
    const viaturas = new Set(escala.composicao.map((e) => e.viatura));

    expect(viaturas.has('ABTS_01')).toBe(true);
    expect(viaturas.has('RESGATE 01')).toBe(true);
    expect(viaturas.has('ATB')).toBe(true);
    expect(viaturas.has('PLATAFORMA')).toBe(true);
    expect(viaturas.has('CHEFE DE OPERAÇÕES')).toBe(true);
    expect(viaturas.has('GUARDA')).toBe(true);
    // Garante que nomes não-canônicos NÃO aparecem mais.
    expect(viaturas.has('ABTS 01')).toBe(false);
    expect(viaturas.has('RESGATE')).toBe(false);
    expect(viaturas.has('MOT CH OP')).toBe(false);
    expect(viaturas.has('ATB e Plat.')).toBe(false);
  });

  it('"ATB e Plat." dedupa o mesmo militar entre R27 e R28 (não vira "Mot 1"/"Mot 2")', async () => {
    let buffer: Buffer;
    try {
      buffer = loadFixture('01 JANEIRO DE 2026.xlsx');
    } catch {
      return;
    }
    const escala = await parseEscalaXlsx({
      buffer,
      filename: '01 JANEIRO DE 2026.xlsx',
    });
    const atbEntries = escala.composicao.filter((e) => e.viatura === 'ATB');
    // Cada equipe deve ter no máximo 1 entry para ATB (mesmo com 2 rows no XLSX).
    const byEquipe = new Map<string, number>();
    for (const e of atbEntries) byEquipe.set(e.equipe, (byEquipe.get(e.equipe) ?? 0) + 1);
    for (const [equipe, count] of byEquipe.entries()) {
      expect.soft(count, `Equipe ${equipe} ATB duplicada`).toBeLessThanOrEqual(1);
    }
    // E sem renomes "Mot 1" / "Mot 2".
    expect(atbEntries.every((e) => e.funcao === 'Mot')).toBe(true);
  });
});
