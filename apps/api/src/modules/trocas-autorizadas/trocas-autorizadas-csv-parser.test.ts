import { describe, it, expect } from 'vitest';
import { parseTrocasAutorizadasCsv, trocasNoData } from './trocas-autorizadas-csv-parser';

const CSV_FIXTURE = `STATUS,Carimbo de data/hora,Endereço de e-mail,DATA DA ESCALA,ESCALADO,SUBSTITUTO,FUNÇÃO,HORÁRIO,DATA DO PAGAMENTO,ESCALADO,SUBSTITUTO,FUNÇÃO,HORÁRIO,A troca de serviço trata-se de uma dobra de serviço (48h)?,Informe o Nº do E-Docs:,nº registro da troca
AUTORIZADA,13/06/2024 17:08:15,marianegbrumatti@gmail.com,15/06/2024,SGT MARIANE,CB ALVARENGA,MERGULHADOR,7h10 às 18h,29/06/2024,CB ALVARENGA,SGT MARIANE,MERGULHADOR,7h10 às 18h,NÃO,,1
AUTORIZADA,17/06/2024 11:30:48,h@e.com,18/06/2024,SGT DANIELI,SD HENRIQUE,MOTORISTA CH OP,24h,13/07/2024,SD HENRIQUE,SGT DANIELI,CONDUTOR ABTS/ATB,24h,"SIM. Justifica.",2024-X5VP33,3
PENDENTE,01/01/2024 10:00:00,x@y.com,02/01/2024,X,Y,Z,W,03/01/2024,Y,X,Z,W,NÃO,,99
,01/01/2024 10:00:00,x@y.com,inválido,X,Y,Z,W,03/01/2024,Y,X,Z,W,NÃO,,100
`;

describe('parseTrocasAutorizadasCsv (item 1)', () => {
  it('parseia trocas AUTORIZADAS, ignora STATUS != AUTORIZADA e datas inválidas', () => {
    const r = parseTrocasAutorizadasCsv(CSV_FIXTURE);
    expect(r).toHaveLength(2);
  });

  it('mapeia colunas corretamente', () => {
    const [t1] = parseTrocasAutorizadasCsv(CSV_FIXTURE);
    expect(t1!.dataEscala).toBe('2024-06-15');
    expect(t1!.dataPagamento).toBe('2024-06-29');
    expect(t1!.escaladoOriginal).toBe('SGT MARIANE');
    expect(t1!.substituto).toBe('CB ALVARENGA');
    expect(t1!.funcao).toBe('MERGULHADOR');
    expect(t1!.horario).toBe('7h10 às 18h');
    expect(t1!.isDobra48h).toBe(false);
    expect(t1!.numeroRegistro).toBe('1');
  });

  it('detecta dobra 48h pelo prefixo "SIM"', () => {
    const r = parseTrocasAutorizadasCsv(CSV_FIXTURE);
    expect(r[1]!.isDobra48h).toBe(true);
    expect(r[1]!.numeroEdocs).toBe('2024-X5VP33');
  });

  it('lida com aspas e vírgulas em campos longos (justificativa)', () => {
    const r = parseTrocasAutorizadasCsv(CSV_FIXTURE);
    expect(r[1]!.escaladoOriginal).toBe('SGT DANIELI');
    expect(r[1]!.substituto).toBe('SD HENRIQUE');
  });
});

describe('trocasNoData (item 1)', () => {
  it('retorna trocas que afetam a data tanto como escala quanto como pagamento', () => {
    const all = parseTrocasAutorizadasCsv(CSV_FIXTURE);
    expect(trocasNoData(all, '2024-06-15')).toHaveLength(1);
    expect(trocasNoData(all, '2024-06-29')).toHaveLength(1);
    expect(trocasNoData(all, '2024-06-18')).toHaveLength(1);
    expect(trocasNoData(all, '2024-06-30')).toHaveLength(0);
  });
});
