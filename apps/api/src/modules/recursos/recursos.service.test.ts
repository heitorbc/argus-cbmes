import { describe, it, expect, beforeEach } from 'vitest';
import { UNIDADE_1CIA_1BBM_ID } from '../unidades/unidades.service';
import { RecursosService } from './recursos.service';

describe('RecursosService — seed 1ª1º', () => {
  let svc: RecursosService;

  beforeEach(() => {
    svc = new RecursosService();
    svc.onModuleInit();
  });

  it('seed cria 19 recursos da 1ª1º na ordem do MF', () => {
    const all = svc.list({ unidadeId: UNIDADE_1CIA_1BBM_ID });
    expect(all).toHaveLength(19);
    expect(all[0]?.nome).toBe('ABTS_01');
    expect(all[0]?.ordem).toBe(1);
    expect(all[all.length - 1]?.nome).toBe('GUARDA');
  });

  it('CHEFE DE OPERAÇÕES é categoria STAFF (não OPERACIONAL)', () => {
    const ch = svc.findByNome(UNIDADE_1CIA_1BBM_ID, 'CHEFE DE OPERAÇÕES');
    expect(ch?.categoria).toBe('STAFF');
    expect(ch?.comportaViatura).toBe(true); // AU 154
    expect(ch?.comportaEfetivo).toBe(true);
  });

  it('MERGULHO/SALVAMAR/QUADRICICLO são categoria AQUATICA', () => {
    const aquaticas = svc
      .list({ unidadeId: UNIDADE_1CIA_1BBM_ID })
      .filter((r) => r.categoria === 'AQUATICA');
    const nomes = aquaticas.map((r) => r.nome).sort();
    expect(nomes).toEqual(
      [
        'MERGULHO 01',
        'MERGULHO 02',
        'QUADRICICLO 01',
        'QUADRICICLO 02',
        'SALVAMAR 01',
        'SALVAMAR 02',
      ].sort(),
    );
  });

  it('GUARDA tem categoria GUARDA e não comporta viatura', () => {
    const g = svc.findByNome(UNIDADE_1CIA_1BBM_ID, 'GUARDA');
    expect(g?.categoria).toBe('GUARDA');
    expect(g?.comportaViatura).toBe(false);
    expect(g?.comportaEfetivo).toBe(true);
  });

  it('EQUIPE SATURAÇÃO e DRO / TELEFONISTA não comportam viatura', () => {
    const sat = svc.findByNome(UNIDADE_1CIA_1BBM_ID, 'EQUIPE SATURAÇÃO');
    const dro = svc.findByNome(UNIDADE_1CIA_1BBM_ID, 'DRO / TELEFONISTA');
    expect(sat?.comportaViatura).toBe(false);
    expect(dro?.comportaViatura).toBe(false);
  });

  it('OFICIAL DE DIA e PERITOS NÃO estão no seed (suprimidos no S6c)', () => {
    expect(svc.findByNome(UNIDADE_1CIA_1BBM_ID, 'OFICIAL DE DIA')).toBeUndefined();
    expect(svc.findByNome(UNIDADE_1CIA_1BBM_ID, 'PERITOS')).toBeUndefined();
  });

  it('nomesValidos retorna whitelist completa para o parser MF', () => {
    const set = svc.nomesValidos(UNIDADE_1CIA_1BBM_ID);
    expect(set.size).toBe(19);
    expect(set.has('ABTS_01')).toBe(true);
    expect(set.has('CHEFE DE OPERAÇÕES')).toBe(true);
    expect(set.has('OFICIAL DE DIA')).toBe(false);
  });

  it('nomesPorCategoria(STAFF) retorna só CHEFE DE OPERAÇÕES', () => {
    const staff = svc.nomesPorCategoria(UNIDADE_1CIA_1BBM_ID, 'STAFF');
    expect(staff).toEqual(['CHEFE DE OPERAÇÕES']);
  });

  it('nomesPorCategoria(AQUATICA) retorna 6 recursos', () => {
    const aq = svc.nomesPorCategoria(UNIDADE_1CIA_1BBM_ID, 'AQUATICA');
    expect(aq).toHaveLength(6);
    expect(aq).toContain('MERGULHO 02');
    expect(aq).toContain('SALVAMAR 01');
  });

  it('list({ ativoSomente: true }) filtra recursos inativos', () => {
    const all = svc.list({ unidadeId: UNIDADE_1CIA_1BBM_ID, ativoSomente: true });
    expect(all.length).toBe(19); // todos ativos por padrão no seed
  });

  it('findById lança NotFoundException para id desconhecido', () => {
    expect(() => svc.findById('recurso:fake')).toThrow();
  });
});

describe('RecursosService — uso pelo parser MF', () => {
  it('whitelist do parser bate com o set retornado por nomesValidos', () => {
    const svc = new RecursosService();
    svc.onModuleInit();
    const set = svc.nomesValidos(UNIDADE_1CIA_1BBM_ID);
    // Espelha a expectativa do parser: linhas com esses nomes na col A passam.
    const espera = [
      'ABTS_01',
      'ABTS_02',
      'ATB',
      'PLATAFORMA',
      'FLORESTAL',
      'EQUIPE SATURAÇÃO',
      'RESGATE 01',
      'RESGATE 02',
      'CHEFE DE OPERAÇÕES',
      'SALVAMAR 01',
      'SALVAMAR 02',
      'QUADRICICLO 01',
      'QUADRICICLO 02',
      'MERGULHO 01',
      'MERGULHO 02',
      'REPDEC 01',
      'REPDEC 02',
      'DRO / TELEFONISTA',
      'GUARDA',
    ];
    for (const nome of espera) {
      expect(set.has(nome)).toBe(true);
    }
  });
});
