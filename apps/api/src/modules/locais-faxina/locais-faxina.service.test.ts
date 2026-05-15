import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { LocaisFaxinaService } from './locais-faxina.service';

describe('LocaisFaxinaService', () => {
  let svc: LocaisFaxinaService;

  beforeEach(() => {
    svc = new LocaisFaxinaService();
    svc.reset();
  });

  it('create + list mantém ordem ascendente', () => {
    svc.create({ nome: 'COZINHA' });
    svc.create({ nome: 'ALOJAMENTO' });
    const list = svc.list();
    expect(list.map((l) => l.nome)).toEqual(['COZINHA', 'ALOJAMENTO']);
    expect(list[0]?.ordem).toBe(1);
    expect(list[1]?.ordem).toBe(2);
  });

  it('rejeita nome duplicado (case-insensitive)', () => {
    svc.create({ nome: 'COZINHA' });
    expect(() => svc.create({ nome: 'cozinha' })).toThrow(ConflictException);
  });

  it('update altera nome + ordem + ativo', () => {
    const l = svc.create({ nome: 'COZINHA' });
    const updated = svc.update(l.id, { nome: 'COZINHA NOVA', ordem: 99, ativo: false });
    expect(updated.nome).toBe('COZINHA NOVA');
    expect(updated.ordem).toBe(99);
    expect(updated.ativo).toBe(false);
  });

  it('softDelete marca ativo=false sem remover', () => {
    const l = svc.create({ nome: 'COZINHA' });
    svc.softDelete(l.id);
    expect(svc.findById(l.id).ativo).toBe(false);
    expect(svc.list().length).toBe(1);
    expect(svc.list({ ativosOnly: true }).length).toBe(0);
  });

  it('findById lança NotFound para id inexistente', () => {
    expect(() => svc.findById('inexistente')).toThrow(NotFoundException);
  });

  it('list({ ativosOnly: true }) filtra inativos', () => {
    const a = svc.create({ nome: 'A' });
    svc.create({ nome: 'B' });
    svc.softDelete(a.id);
    expect(svc.list({ ativosOnly: true }).map((l) => l.nome)).toEqual(['B']);
  });
});
