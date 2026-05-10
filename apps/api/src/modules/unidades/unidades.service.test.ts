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
