import { describe, it, expect } from 'vitest';
import { parseQdiCsv } from './qdi-csv-parser';

/** Fixture pequeno mas representativo da estrutura real do QDI. */
const QDI_FIXTURE = [
  ',,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  ',,EDOCS,1ºBBM - VITÓRIA,,,,,,,,,,,,,,,,,,,,,,,,,',
  'ANT.,NF,BM1BBM,1ºBBM - VITÓRIA,PREVISTO,POST/GRAD,NOME DE GUERRA,,DESIG.',
  '24,903209,,Comandante de Batalhão,ADM 11,TC,TC,SIWAMY,SIM',
  ',,BM1SECRE,SECRETARIA DO COMANDO,,,,,,',
  '986,4150791,,Auxiliar,ADM 11,CB,CB,CAROLINE,SIM',
  ',,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  ',1ªCIA/1ºBBM - VITÓRIA,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  ',,BM11CIA,1ªCIA/1ºBBM - VITÓRIA,PREVISTO,POST/GRAD,NOME DE GUERRA,,,,,,,,,,,,,,,,,,,,,,',
  '123,4207190,,Comandante,ADM 11,CAP QOC,1ºTEN QOC,VASSEM,,CAP QOC1ºTEN QOC,,4207190,APTO',
  '366,2982390,BM11SARG,Sargenteante,ADM 11,SGT,2ºSGT,D. MATTOS,SIM,SGT2ºSGT,,2982390,APTO',
  'RR 66,902114,,Auxiliar de Logística,ADM 11,RR,2ºTEN QOA RR,GERALDO,,RR2ºTEN QOA RR,,902114,APTO',
  ',,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  ',,BM11SAT,SAT - VITÓRIA,,,,,,,,,,,,,,,,,,,,,,,,,',
  '241,903581,,,SAT 11,SGT,1ºSGT,MATTOS,SIM,SGT1ºSGT,,903581,APTO',
  ',,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  ',,BM11OPER,SEÇÃO DE OPERAÇÕES DE SALVAMENTO (SOS),,,,,,',
  '364,2984946,,,PRONT 11,SGT,2ºSGT,MARIANE,SIM,SGT2ºSGT,,2984946,APTO',
  '418,3037509,,,PRONT 11,SGT,2ºSGT,BARCELLOS,SIM,SGT2ºSGT,,3037509,APTO',
  '526,2754665,,,PRONT CERD,SGT,3ºSGT,FELIPE GUIMARAES,,SGT3ºSGT,,2754665,ADIDO',
  '890,3670180,,Condutor,PRONT 11,CB,CB,VICENTE,SIM,CBCB,,3670180,APTO',
  '1095,4750241,,,PRONT 11,SD,SD,MARTINELLI,SIM,SDSD,,4750241,APTO',
  '--,,,,PRONT 11,SD,--,--,,SD,,',
  ',,,GUARDA QCG,,,,,,,,,,,,,,,,,,,,,,,,,',
  '1163,4750713,,,GUARD 11,SD,SD,CAUE LYRA,SIM,SDSD,,4750713,APTO',
  ',,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  ',PELOTÃO DE ATIVIDADES AQUÁTICAS,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  ',,,OPERAÇÕES,,,,,,,,,,,,,,,,,,,,,,,,,',
  '400,2981823,,Chefe de Guarnição do Mergulho/Condutor,PRONT AA,SGT,2ºSGT,ALEXANDRE,SIM,,,2981823,APTO',
  ',,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  ',MILITARES EM EXCESSO/AFASTADOS,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  '999,9999999,,,EXC 11,SGT,2ºSGT,DUMMY,SIM,,,9999999,EXCESSO',
].join('\n');

describe('parseQdiCsv', () => {
  it('extrai militares apenas das 4 seções da 1ª Cia (staff, sos, guarda, aquaticas)', () => {
    const out = parseQdiCsv(QDI_FIXTURE);

    // Filtrar pelos NFs esperados
    const nfs = out.map((m) => m.nf).sort();
    expect(nfs).toContain('4207190'); // Cmt staff
    expect(nfs).toContain('2982390'); // Sargenteante D. MATTOS staff
    expect(nfs).toContain('2984946'); // MARIANE sos
    expect(nfs).toContain('3037509'); // BARCELLOS sos
    expect(nfs).toContain('3670180'); // VICENTE sos
    expect(nfs).toContain('4750241'); // MARTINELLI sos
    expect(nfs).toContain('4750713'); // CAUE LYRA guarda
    expect(nfs).toContain('2981823'); // ALEXANDRE aquaticas

    // Adidos PRONT CERD aparecem dentro da seção SOS — incluídos por decisão (sem filtro de SITUAÇÃO=ADIDO)
    expect(nfs).toContain('2754665'); // FELIPE GUIMARAES adido CERD

    // Não inclui SAT, BBM staff, ou EXCESSO
    expect(nfs).not.toContain('903209'); // SIWAMY (Cmt do batalhão, fora da 1ª Cia)
    expect(nfs).not.toContain('4150791'); // CAROLINE (Secretaria do Comando, fora 1ª Cia)
    expect(nfs).not.toContain('903581'); // SAT MATTOS (não 1ª Cia)
    expect(nfs).not.toContain('9999999'); // DUMMY excesso
  });

  it('reservistas (RR ###) são descartados', () => {
    const out = parseQdiCsv(QDI_FIXTURE);
    expect(out.find((m) => m.nf === '902114')).toBeUndefined();
  });

  it('rows com nome/posto = "--" (slots vagos) são descartadas', () => {
    const out = parseQdiCsv(QDI_FIXTURE);
    // O fixture tem "--,,,,PRONT 11,SD,--,--," — sem NF e com "--"
    expect(out.every((m) => m.nf && m.nomeGuerra !== '--')).toBe(true);
  });

  it('atribui subSecao corretamente para cada militar', () => {
    const out = parseQdiCsv(QDI_FIXTURE);
    expect(out.find((m) => m.nf === '4207190')?.subSecao).toBe('staff');
    expect(out.find((m) => m.nf === '2982390')?.subSecao).toBe('staff');
    expect(out.find((m) => m.nf === '3037509')?.subSecao).toBe('sos');
    expect(out.find((m) => m.nf === '2984946')?.subSecao).toBe('sos');
    expect(out.find((m) => m.nf === '4750713')?.subSecao).toBe('guarda');
    expect(out.find((m) => m.nf === '2981823')?.subSecao).toBe('aquaticas');
  });

  it('preserva campos esperados (postoAtual, nomeGuerra, funcao, situacao)', () => {
    const out = parseQdiCsv(QDI_FIXTURE);
    const heitor = out.find((m) => m.nf === '3037509');
    expect(heitor).toBeDefined();
    expect(heitor?.postoAtual).toBe('2ºSGT');
    expect(heitor?.nomeGuerra).toBe('BARCELLOS');
    expect(heitor?.situacao).toBe('APTO');

    const sargenteante = out.find((m) => m.nf === '2982390');
    expect(sargenteante?.nomeGuerra).toBe('D. MATTOS');
    expect(sargenteante?.funcao).toBe('Sargenteante');

    const cmt = out.find((m) => m.nf === '4207190');
    expect(cmt?.postoAtual).toBe('1ºTEN QOC');
    expect(cmt?.funcao).toBe('Comandante');
  });

  it('marca adidos via situacao mas mantém na lista', () => {
    const out = parseQdiCsv(QDI_FIXTURE);
    const adido = out.find((m) => m.nf === '2754665');
    expect(adido).toBeDefined();
    expect(adido?.situacao).toBe('ADIDO');
    expect(adido?.subSecao).toBe('sos');
  });

  it('retorna lista vazia se CSV não tem seções da 1ª Cia', () => {
    const semCia = ['ANT.,NF,POSTO,NOME', '24,903209,TC,SIWAMY'].join('\n');
    expect(parseQdiCsv(semCia)).toEqual([]);
  });
});
