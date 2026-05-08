import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { FiscaisService } from './fiscais.service';

describe('FiscaisService', () => {
  let service: FiscaisService;

  beforeEach(() => {
    service = new FiscaisService();
  });

  it('lista vazia inicialmente', () => {
    expect(service.list()).toEqual([]);
  });

  it('cria, busca, lista e deleta', () => {
    const f = service.create(
      {
        militarNf: '3037509',
        equipe: 'C',
        vigenciaInicio: '2026-04-01',
        vigenciaFim: '2026-04-30',
        motivo: 'Substituto durante curso CHS',
      },
      '3037509',
    );

    expect(f.id).toBeDefined();
    expect(f.militarNf).toBe('3037509');
    expect(service.list()).toHaveLength(1);

    expect(service.findById(f.id).id).toBe(f.id);

    service.delete(f.id);
    expect(service.list()).toEqual([]);
    expect(() => service.delete('inexistente')).toThrow(NotFoundException);
  });

  describe('getCadastradoVigente', () => {
    it('retorna null se não há cadastros', () => {
      expect(service.getCadastradoVigente('C', '2026-05-01')).toBeNull();
    });

    it('respeita vigência (data fora do intervalo → null)', () => {
      service.create(
        {
          militarNf: '3037509',
          equipe: 'C',
          vigenciaInicio: '2026-04-01',
          vigenciaFim: '2026-04-30',
        },
        '999',
      );
      expect(service.getCadastradoVigente('C', '2026-05-01')).toBeNull();
      expect(service.getCadastradoVigente('C', '2026-04-15')?.militarNf).toBe('3037509');
    });

    it('vigenciaFim ausente = vigente indefinidamente', () => {
      service.create({ militarNf: '3037509', equipe: 'C', vigenciaInicio: '2026-01-01' }, '999');
      expect(service.getCadastradoVigente('C', '2027-12-31')?.militarNf).toBe('3037509');
    });

    it('cadastro sem equipe = curinga (vale para qualquer equipe)', () => {
      service.create(
        { militarNf: '3037509', vigenciaInicio: '2026-04-01', vigenciaFim: '2026-04-30' },
        '999',
      );
      expect(service.getCadastradoVigente('A', '2026-04-15')?.militarNf).toBe('3037509');
      expect(service.getCadastradoVigente('B', '2026-04-15')?.militarNf).toBe('3037509');
    });

    it('cadastro específico (com equipe) vence sobre genérico (sem equipe)', () => {
      service.create({ militarNf: 'GENERICO', vigenciaInicio: '2026-04-01' }, '999');
      service.create({ militarNf: 'ESPECIFICO', equipe: 'C', vigenciaInicio: '2026-04-01' }, '999');
      expect(service.getCadastradoVigente('C', '2026-04-15')?.militarNf).toBe('ESPECIFICO');
      expect(service.getCadastradoVigente('A', '2026-04-15')?.militarNf).toBe('GENERICO');
    });
  });

  describe('getVigente (cadastro → default)', () => {
    it('quando há cadastro, retorna origem=cadastrado', () => {
      const f = service.create(
        { militarNf: 'OVERRIDE', equipe: 'C', vigenciaInicio: '2026-04-01' },
        '999',
      );
      const v = service.getVigente('C', '2026-04-15', [
        { nf: 'A', ant: 100 },
        { nf: 'B', ant: 50 }, // mais antigo
      ]);
      expect(v).toEqual({ militarNf: 'OVERRIDE', origem: 'cadastrado', fiscalId: f.id });
    });

    it('sem cadastro, retorna o de menor ANT (mais antigo)', () => {
      const v = service.getVigente('C', '2026-05-01', [
        { nf: '4750241', ant: 1095 }, // SD
        { nf: '3037509', ant: 418 }, // 2ºSGT — mais antigo
        { nf: '3670180', ant: 890 }, // CB
      ]);
      expect(v?.militarNf).toBe('3037509');
      expect(v?.origem).toBe('default');
    });

    it('lista vazia → null', () => {
      expect(service.getVigente('C', '2026-05-01', [])).toBeNull();
    });
  });
});
