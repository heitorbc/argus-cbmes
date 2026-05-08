import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ViaturasService } from './viaturas.service';

describe('ViaturasService', () => {
  let service: ViaturasService;

  beforeEach(() => {
    service = new ViaturasService();
  });

  it('inicia com as 13 viaturas seed da 1ª Cia', () => {
    const all = service.list();
    expect(all).toHaveLength(13);

    const prefixos = all.map((v) => v.prefixo);
    expect(prefixos).toContain('AU 154');
    expect(prefixos).toContain('ABTS 011');
    expect(prefixos).toContain('AR 044');
    expect(prefixos).toContain('TE 110');
  });

  it('TE 110 vem com status "baixada" (decisão institucional do PRD)', () => {
    const te110 = service.findByPrefixo('TE 110');
    expect(te110?.status).toBe('baixada');
  });

  it('lista é ordenada por prefixo (alfabética)', () => {
    const all = service.list();
    const prefixos = all.map((v) => v.prefixo);
    const sorted = [...prefixos].sort((a, b) => a.localeCompare(b));
    expect(prefixos).toEqual(sorted);
  });

  it('cria nova viatura com prefixo válido', () => {
    const created = service.create({
      prefixo: 'AB 999',
      tipo: 'AU',
      status: 'operacional',
      composicaoFuncoes: ['motorista'],
      funcaoOperacional: 'Teste',
    });
    expect(created.id).toBeDefined();
    expect(created.prefixo).toBe('AB 999');
    expect(service.list()).toHaveLength(14);
  });

  it('rejeita criação com prefixo duplicado', () => {
    expect(() =>
      service.create({
        prefixo: 'ABTS 011',
        tipo: 'ABTS',
        status: 'operacional',
        composicaoFuncoes: [],
      }),
    ).toThrow(ConflictException);
  });

  it('atualiza status de uma viatura', () => {
    const ar044 = service.findByPrefixo('AR 044');
    expect(ar044).toBeDefined();
    if (!ar044) return;

    const updated = service.update(ar044.id, { status: 'em_manutencao' });
    expect(updated.status).toBe('em_manutencao');
    // atualizadoEm pode estar no mesmo ms se a operação for instantânea —
    // o que importa é que seja >= ao anterior
    expect(updated.atualizadoEm >= ar044.atualizadoEm).toBe(true);
  });

  it('rejeita update de prefixo para um já existente', () => {
    const ar044 = service.findByPrefixo('AR 044');
    if (!ar044) throw new Error('seed inválido');
    expect(() => service.update(ar044.id, { prefixo: 'ABTS 011' })).toThrow(ConflictException);
  });

  it('softDelete marca status como baixada (não remove da lista)', () => {
    const ar044 = service.findByPrefixo('AR 044');
    if (!ar044) throw new Error('seed inválido');

    const deleted = service.softDelete(ar044.id);
    expect(deleted.status).toBe('baixada');
    expect(service.list()).toHaveLength(13);
  });

  it('findById lança NotFoundException para id inexistente', () => {
    expect(() => service.findById('inexistente-uuid')).toThrow(NotFoundException);
  });
});
