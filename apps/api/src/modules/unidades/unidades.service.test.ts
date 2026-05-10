import { describe, it, expect, beforeEach } from 'vitest';
import { UnidadesService, UNIDADE_1CIA_1BBM_ID } from './unidades.service';

describe('UnidadesService', () => {
  let svc: UnidadesService;

  beforeEach(() => {
    svc = new UnidadesService();
    svc.onModuleInit();
  });

  it('seed cria a 1ª1º com codigo e nome corretos', () => {
    const all = svc.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.codigo).toBe('1ª1º');
    expect(all[0]?.nome).toBe('1ª Cia / 1º BBM');
    expect(all[0]?.ativo).toBe(true);
  });

  it('findById resolve o slug fixo', () => {
    const u = svc.findById(UNIDADE_1CIA_1BBM_ID);
    expect(u.id).toBe(UNIDADE_1CIA_1BBM_ID);
  });

  it('findById lança NotFoundException para id desconhecido', () => {
    expect(() => svc.findById('unid:nao-existe')).toThrow();
  });

  it('findByCodigo localiza por código curto', () => {
    expect(svc.findByCodigo('1ª1º')?.id).toBe(UNIDADE_1CIA_1BBM_ID);
    expect(svc.findByCodigo('inexistente')).toBeUndefined();
  });
});

describe('UnidadesService — CRUD admin (S6e)', () => {
  let svc: UnidadesService;

  beforeEach(() => {
    svc = new UnidadesService();
    svc.onModuleInit();
  });

  it('create adiciona nova unidade com id slug:UUID e ativo=true por padrão', () => {
    const u = svc.create({ codigo: '2ª1º', nome: '2ª Cia / 1º BBM' });
    expect(u.codigo).toBe('2ª1º');
    expect(u.ativo).toBe(true);
    expect(u.id).toMatch(/^unid:/);
    expect(svc.list()).toHaveLength(2);
  });

  it('create rejeita codigo duplicado com 409', () => {
    expect(() => svc.create({ codigo: '1ª1º', nome: 'duplicada' })).toThrow();
  });

  it('update muda nome preservando codigo e id', () => {
    const u = svc.update(UNIDADE_1CIA_1BBM_ID, { nome: 'Novo Nome' });
    expect(u.nome).toBe('Novo Nome');
    expect(u.codigo).toBe('1ª1º');
    expect(u.id).toBe(UNIDADE_1CIA_1BBM_ID);
  });

  it('update rejeita mudança para codigo já existente', () => {
    svc.create({ codigo: '2ª1º', nome: 'Segunda' });
    const segunda = svc.findByCodigo('2ª1º')!;
    expect(() => svc.update(segunda.id, { codigo: '1ª1º' })).toThrow();
  });

  it('softDelete marca ativo=false sem remover do storage', () => {
    const u = svc.softDelete(UNIDADE_1CIA_1BBM_ID);
    expect(u.ativo).toBe(false);
    expect(svc.findById(UNIDADE_1CIA_1BBM_ID).ativo).toBe(false);
    expect(svc.list()).toHaveLength(1); // ainda no storage
  });
});
