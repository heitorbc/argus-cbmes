import { describe, it, expect } from 'vitest';
import { parseEfetivoCsv } from './efetivo-csv-parser';

const HEADER =
  'QTD,NF,ANT.,POS/GRAD,NOME COMPLETO,PRONTUÁRIO,TEL,RG,CPF,NASCIMENTO,EMAIL,VALIDADE CNH,HABILITAÇÃO,MÊS/ANO CCVE,Município,INCORP.,IDADE,SERVIÇO,ÚLTIMA CHAMADA,PARA FINS DE,SITUAÇÃO,PRÓXIMA,VENC.,FÉRIAS,Senso,,,,,,DATA ATUAL';

describe('parseEfetivoCsv', () => {
  it('faz parse de linhas válidas e ignora linhas-resumo', () => {
    const csv = [
      HEADER,
      '1,903209,24,TC,SIWAMY REIS DOS ANJOS,,,,,26/10/1980,,,,,,19/03/2001,,,,,,,,,,,,,,,',
      '24,3037509,419,2ºSGT,HEITOR BARCELLOS COELHO,41735,(27) 999106697,1201907/ES,108.911.797-39,23/02/1989,heitorhbc@gmail.com,22/03/2030,AE,2021,Vila Velha,16/03/2009,37,17,,CSASCT,,,,,,,,,,',
      // linha-resumo (sem NF / posto / nome) — deve ser descartada:
      ',,,,,,,,,,,,,,,,126,126,,,,,,,,,,,,,',
      ',,,,,,,,,,,,,,,,126,126,,,,,-46150 DIAS(s) IRREGULAR,,,,,,,,',
    ].join('\n');

    const out = parseEfetivoCsv(csv);
    expect(out).toHaveLength(2);
    expect(out[0]?.nf).toBe('903209');
    expect(out[1]?.nf).toBe('3037509');
  });

  it('ordena por ANT crescente (mais antigo primeiro)', () => {
    const csv = [
      HEADER,
      '5,3037509,419,2ºSGT,HEITOR BARCELLOS COELHO,,,,,23/02/1989,,,,,Vila Velha,16/03/2009,37,17,,,,,,,,,,,,,',
      '1,903209,24,TC,SIWAMY REIS DOS ANJOS,,,,,26/10/1980,,,,,,19/03/2001,,,,,,,,,,,,,,,',
      '3,2693119,36,MAJ,HEITOR HENRIQUE LUBE DA SILVA,,,,,16/01/1989,,,,,,02/06/2008,37,17,,,,,,,,,,,,,',
    ].join('\n');

    const out = parseEfetivoCsv(csv);
    expect(out.map((m) => m.ant)).toEqual([24, 36, 419]);
    expect(out[0]?.posto).toBe('TC');
  });

  it('extrai campos opcionais quando presentes', () => {
    const csv = [
      HEADER,
      '24,3037509,419,2ºSGT,HEITOR BARCELLOS COELHO,41735,(27) 999106697,1201907/ES,108.911.797-39,23/02/1989,heitorhbc@gmail.com,22/03/2030,AE,2021,Vila Velha,16/03/2009,37,17,,CSASCT,,,,,,,,,,',
    ].join('\n');

    const out = parseEfetivoCsv(csv);
    const heitor = out[0];
    expect(heitor).toBeDefined();
    expect(heitor?.municipio).toBe('Vila Velha');
    expect(heitor?.idade).toBe(37);
    expect(heitor?.servico).toBe(17);
    expect(heitor?.situacao).toBe('CSASCT');
  });

  it('retorna array vazio se CSV só tem cabeçalho', () => {
    expect(parseEfetivoCsv(HEADER)).toEqual([]);
  });
});
