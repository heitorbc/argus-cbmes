import { describe, it, expect } from 'vitest';
import { parseTrocasAutorizadasCsv, trocasNoData } from './trocas-autorizadas-csv-parser';

/**
 * Fixture com header novo (S2.8.3 — 25 colunas). Replicado fielmente do
 * CSV cru da planilha.
 */
const HEADER =
  'STATUS TROCA,STATUS NOME,Carimbo de data/hora,Endereço de e-mail,DATA DA ESCALA,' +
  'NÚMERO FUNCIONAL DO ESCALADO,NF DO MILITAR ESCALADO,AUTO Nome Militar Escalado,ESCALADO,' +
  'NÚMERO FUNCIONAL DO SUBSTITUTO,NF DO MILITAR SUBSTITUTO,AUTO Nome Militar Subistituto,SUBSTITUTO,' +
  'FUNÇÃO,HORÁRIO,DATA DO PAGAMENTO,ESCALADO,SUBSTITUTO,FUNÇÃO,HORÁRIO,' +
  'A troca de serviço trata-se de uma dobra de serviço (48h)?,Informe o Nº do E-Docs:,' +
  'NÚMERO FUNCIONAL DO MILITAR ESCALADO,NÚMERO FUNCIONAL DO MILITAR SUBSTITUTO,nº registro da troca';

// Linha PENDENTE com NFs preenchidas (caso real do CSV)
const ROW_PENDENTE =
  'PENDENTE,NOME OK,13/06/2024 17:08:15,marianegbrumatti@gmail.com,15/06/2024,' +
  ',2984946,2ºSGT MARIANE,SGT MARIANE ,' +
  ',3132170,CB ALVARENGA,CB ALVARENGA,' +
  'MERGULHADOR,7h10 às 18h,29/06/2024,CB ALVARENGA,SGT MARIANE,MERGULHADOR,7h10 às 18h,NÃO,,,,1';

// Linha VERIFICADO
const ROW_VERIFICADO =
  'VERIFICADO,NOME OK,13/06/2024 19:26:27,a@b.com,24/06/2024,' +
  ',4749472,SD AMANDA,SD AMANDA ,' +
  ',3269175,CB IZACK GONCALVES,CB IZACK GONÇALVES ,' +
  'SENTINELA,24h,18/06/2024,CB IZACK GONÇALVES ,SD AMANDA,OPERADOR/SOCORRISTA,24h,NÃO,,,,2';

// Linha com dobra 48h e justificativa longa (vírgulas e ponto)
const ROW_DOBRA =
  'PENDENTE,NOME OK,14/06/2024 08:00:13,c@d.com,18/06/2024,' +
  ',2928310,3ºSGT DANIELI PERINI,Sgt Danieli Perini,' +
  ',4151364,CB HENRIQUE LOPES,Se Henrique Lopes,' +
  'OPERADOR/SOCORRISTA,24h,13/07/2024,As Henrique Lopes,Sgt Danieli Perini,OPERADOR/SOCORRISTA,24h,' +
  '"SIM. Informo, todavia, que estou apto.",2024-X5VP33,,,3';

// Linha com data inválida (descartada)
const ROW_DATA_INVALIDA =
  ',,01/01/2024,x@y.com,inválido,,1234567,X,X,,2345678,Y,Y,Z,W,03/01/2024,Y,X,Z,W,NÃO,,,,100';

const CSV_FIXTURE = `${HEADER}\n${ROW_PENDENTE}\n${ROW_VERIFICADO}\n${ROW_DOBRA}\n${ROW_DATA_INVALIDA}\n`;

describe('parseTrocasAutorizadasCsv (S2.8.3 — novo layout)', () => {
  it('parseia todas as linhas com data válida (independente de status)', () => {
    const r = parseTrocasAutorizadasCsv(CSV_FIXTURE);
    // 3 válidas (PENDENTE, VERIFICADO, DOBRA); ROW_DATA_INVALIDA descartada.
    expect(r).toHaveLength(3);
  });

  it('mapeia status, NFs e auto-nomes corretamente', () => {
    const [t1] = parseTrocasAutorizadasCsv(CSV_FIXTURE);
    expect(t1!.statusTroca).toBe('PENDENTE');
    expect(t1!.statusNome).toBe('NOME OK');
    expect(t1!.dataEscala).toBe('2024-06-15');
    expect(t1!.dataPagamento).toBe('2024-06-29');
    expect(t1!.escaladoOriginal).toBe('2ºSGT MARIANE'); // auto nome
    expect(t1!.escaladoOriginalNf).toBe('2984946');
    expect(t1!.substituto).toBe('CB ALVARENGA');
    expect(t1!.substitutoNf).toBe('3132170');
    expect(t1!.funcao).toBe('MERGULHADOR');
    expect(t1!.horario).toBe('7h10 às 18h');
    expect(t1!.isDobra48h).toBe(false);
    expect(t1!.numeroRegistro).toBe('1');
  });

  it('reconhece VERIFICADO no segundo registro', () => {
    const [, t2] = parseTrocasAutorizadasCsv(CSV_FIXTURE);
    expect(t2!.statusTroca).toBe('VERIFICADO');
    expect(t2!.escaladoOriginalNf).toBe('4749472');
    expect(t2!.substitutoNf).toBe('3269175');
  });

  it('detecta dobra 48h pelo prefixo "SIM" e captura E-Docs', () => {
    const r = parseTrocasAutorizadasCsv(CSV_FIXTURE);
    expect(r[2]!.isDobra48h).toBe(true);
    expect(r[2]!.numeroEdocs).toBe('2024-X5VP33');
  });

  it('lida com aspas e vírgulas em campos longos (justificativa)', () => {
    const r = parseTrocasAutorizadasCsv(CSV_FIXTURE);
    expect(r[2]!.escaladoOriginal).toBe('3ºSGT DANIELI PERINI');
    expect(r[2]!.substituto).toBe('CB HENRIQUE LOPES');
  });

  it('descarta linha com data de escala inválida', () => {
    const r = parseTrocasAutorizadasCsv(CSV_FIXTURE);
    expect(r.some((t) => t.numeroRegistro === '100')).toBe(false);
  });

  it('fallback nome manual (col I) quando auto-nome (col H) está vazio', () => {
    const csv = `${HEADER}\nPENDENTE,,01/01/2024,a@b.com,15/06/2024,,9999999,,FALLBACK MANUAL,,8888888,,OUTRO MANUAL,X,Y,29/06/2024,A,B,C,D,NÃO,,,,50`;
    const r = parseTrocasAutorizadasCsv(csv);
    expect(r).toHaveLength(1);
    expect(r[0]!.escaladoOriginal).toBe('FALLBACK MANUAL');
    expect(r[0]!.substituto).toBe('OUTRO MANUAL');
  });
});

describe('trocasNoData (item 1)', () => {
  it('retorna trocas que afetam a data tanto como escala quanto como pagamento', () => {
    const all = parseTrocasAutorizadasCsv(CSV_FIXTURE);
    expect(trocasNoData(all, '2024-06-15')).toHaveLength(1);
    expect(trocasNoData(all, '2024-06-29')).toHaveLength(1);
    expect(trocasNoData(all, '2024-06-18')).toHaveLength(2); // 18/06 aparece em VERIFICADO (pagamento) e DOBRA (escala)
    expect(trocasNoData(all, '2024-06-30')).toHaveLength(0);
  });
});
