import { describe, it, expect } from 'vitest';
import { parseViaturasQdvCsv } from './viaturas-qdv-csv-parser';

const CSV_FIXTURE = `"ATUALIZADO EM:","24/04/2026","OBM","1ºBBM/1ªCIA","","",""
"RESPONSÁVEL","NF:","899577","1ºSGT MARCELO","","",""
"PREFIXO","STATUS","EMPRESTADA A:","KM ATUAL","OBS","EMPREGO PRIMÁRIO","EMPREGO SECUNDÁRIO","PLACA","MARCA / MODELO","TIPO DO COMBUSTÍVEL","",""
"ABTS_011","DISPONÍVEL","","12345","Sem novidades","OPERACIONAL","OPERACIONAL ABTS","SFP4F01","SCANIA / P280","DIESEL S10","","1ºBBM/1ªCIA"
"AR_044","DISPONÍVEL","","8500","","OPERACIONAL","OPERACIONAL RESGATE","SFT3D63","M.BENZ / 315","DIESEL S10","","1ºBBM/1ªCIA"
"TE_110","BAIXADA","","","Aguardando peças","OPERACIONAL","OPERACIONAL PLATAFORMA","MPB9836","M.BENZ / IMP","DIESEL S10","","1ºBBM/1ªCIA"
"AU_154","EMPRESTADA","2ºCIA/1ºBBM","45000","","OPERACIONAL","OPERACIONAL CH OP","SFU6B63","MITSUBISHI L200","DIESEL S10","","1ºBBM/1ªCIA"
`;

describe('parseViaturasQdvCsv (item 3)', () => {
  it('extrai 4 viaturas do CSV', () => {
    const r = parseViaturasQdvCsv(CSV_FIXTURE);
    expect(r).toHaveLength(4);
    expect(r.map((v) => v.prefixo)).toEqual(['ABTS_011', 'AR_044', 'TE_110', 'AU_154']);
  });

  it('mapeia status, KM atual, marca/modelo', () => {
    const r = parseViaturasQdvCsv(CSV_FIXTURE);
    const abts = r.find((v) => v.prefixo === 'ABTS_011')!;
    expect(abts.status).toBe('DISPONÍVEL');
    expect(abts.kmAtual).toBe(12345);
    expect(abts.marcaModelo).toBe('SCANIA / P280');
    expect(abts.combustivel).toBe('DIESEL S10');
    expect(abts.empregoSecundario).toBe('OPERACIONAL ABTS');
    expect(abts.placa).toBe('SFP4F01');
    expect(abts.obm).toBe('1ºBBM/1ªCIA');
  });

  it('lida com viatura BAIXADA (sem KM, com observação)', () => {
    const r = parseViaturasQdvCsv(CSV_FIXTURE);
    const te = r.find((v) => v.prefixo === 'TE_110')!;
    expect(te.status).toBe('BAIXADA');
    expect(te.kmAtual).toBeUndefined();
    expect(te.observacao).toBe('Aguardando peças');
  });

  it('preserva campo "EMPRESTADA A:" quando viatura emprestada', () => {
    const r = parseViaturasQdvCsv(CSV_FIXTURE);
    const au = r.find((v) => v.prefixo === 'AU_154')!;
    expect(au.status).toBe('EMPRESTADA');
    expect(au.emprestadaA).toBe('2ºCIA/1ºBBM');
  });

  it('retorna [] em CSV sem header PREFIXO', () => {
    expect(parseViaturasQdvCsv('a,b,c\n1,2,3')).toEqual([]);
  });
});
