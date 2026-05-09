import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { RecursoMapaForca } from '@argus/shared-types';
import { ViaturasService } from './viaturas.service';

class FakeMapaForcaService {
  constructor(private readonly recursos: RecursoMapaForca[]) {}
  async getRecursos(): Promise<readonly RecursoMapaForca[]> {
    return this.recursos;
  }
}

const RECURSOS_BASE: RecursoMapaForca[] = [
  {
    recurso: 'ABTS_01',
    vtrPrefixo: 'ABTS_011',
    vtrStatus: 'DISPONIVEL',
    semEquipe: false,
    operadores: [],
  },
  {
    recurso: 'RESGATE 01',
    vtrPrefixo: 'AR_044',
    vtrStatus: 'DISPONIVEL',
    semEquipe: false,
    operadores: [],
  },
  {
    recurso: 'CHEFE DE OPERAÇÕES',
    vtrPrefixo: 'AU_154',
    vtrStatus: 'DISPONIVEL',
    semEquipe: false,
    operadores: [],
  },
  {
    recurso: 'PLATAFORMA',
    vtrPrefixo: 'TE_110',
    vtrStatus: 'BAIXADA',
    semEquipe: true,
    operadores: [],
  },
  {
    recurso: 'MERGULHO 02',
    vtrPrefixo: 'AM_002',
    vtrStatus: 'DISPONIVEL',
    semEquipe: false,
    operadores: [],
  },
  {
    recurso: 'GUARDA',
    vtrPrefixo: undefined,
    vtrStatus: null,
    semEquipe: false,
    operadores: ['SD A', 'SD B', 'SD C'],
  },
  {
    recurso: 'RESGATE 02',
    vtrPrefixo: 'AR_031',
    vtrStatus: 'EMPRESTADA',
    semEquipe: true,
    operadores: [],
  },
];

function makeService(recursos: RecursoMapaForca[] = RECURSOS_BASE): ViaturasService {
  return new ViaturasService(new FakeMapaForcaService(recursos) as never);
}

describe('ViaturasService (S5 — fonte: Mapa Força)', () => {
  let service: ViaturasService;

  beforeEach(() => {
    service = makeService();
  });

  it('lista viaturas a partir do Mapa Força (ignora recursos sem vtrPrefixo, ex.: GUARDA)', async () => {
    const all = await service.list();
    const prefixos = all.map((v) => v.prefixo);
    expect(prefixos).toContain('ABTS_011');
    expect(prefixos).toContain('AR_044');
    expect(prefixos).toContain('AU_154');
    expect(prefixos).toContain('TE_110');
    expect(prefixos).toContain('AM_002');
    expect(prefixos).toContain('AR_031');
    // GUARDA não tem vtrPrefixo — não vira viatura
    expect(prefixos).toHaveLength(6);
  });

  it('mapeia status: DISPONIVEL→operacional, BAIXADA→baixada, EMPRESTADA→reserva', async () => {
    const all = await service.list();
    expect(all.find((v) => v.prefixo === 'ABTS_011')?.status).toBe('operacional');
    expect(all.find((v) => v.prefixo === 'TE_110')?.status).toBe('baixada');
    expect(all.find((v) => v.prefixo === 'AR_031')?.status).toBe('reserva');
  });

  it('deduz tipo a partir do prefixo (ABTS_011→ABTS, AM_002→AM, AU_154→AU)', async () => {
    const all = await service.list();
    expect(all.find((v) => v.prefixo === 'ABTS_011')?.tipo).toBe('ABTS');
    expect(all.find((v) => v.prefixo === 'AM_002')?.tipo).toBe('AM');
    expect(all.find((v) => v.prefixo === 'AU_154')?.tipo).toBe('AU');
    expect(all.find((v) => v.prefixo === 'TE_110')?.tipo).toBe('TE');
  });

  it('preserva o nome do recurso em funcaoOperacional (ex.: "MERGULHO 02")', async () => {
    const all = await service.list();
    expect(all.find((v) => v.prefixo === 'AM_002')?.funcaoOperacional).toBe('MERGULHO 02');
    expect(all.find((v) => v.prefixo === 'AU_154')?.funcaoOperacional).toBe('CHEFE DE OPERAÇÕES');
  });

  it('lista é ordenada por prefixo', async () => {
    const all = await service.list();
    const prefixos = all.map((v) => v.prefixo);
    const sorted = [...prefixos].sort((a, b) => a.localeCompare(b));
    expect(prefixos).toEqual(sorted);
  });

  it('admin pode criar viatura adicional (override) que não está no MF', async () => {
    const created = await service.create({
      prefixo: 'AB 999',
      tipo: 'AU',
      status: 'operacional',
      composicaoFuncoes: ['motorista'],
      funcaoOperacional: 'Teste extra',
    });
    expect(created.id).toBeDefined();
    const all = await service.list();
    expect(all.find((v) => v.prefixo === 'AB 999')).toBeDefined();
    expect(all).toHaveLength(7);
  });

  it('rejeita criação com prefixo já existente (vindo do MF)', async () => {
    await expect(
      service.create({
        prefixo: 'ABTS_011',
        tipo: 'ABTS',
        status: 'operacional',
        composicaoFuncoes: [],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('update aplica override sobre o snapshot do MF', async () => {
    const ar044 = await service.findByPrefixo('AR_044');
    expect(ar044).toBeDefined();
    if (!ar044) return;
    const updated = await service.update(ar044.id, { status: 'em_manutencao' });
    expect(updated.status).toBe('em_manutencao');
    const reread = await service.findByPrefixo('AR_044');
    expect(reread?.status).toBe('em_manutencao');
  });

  it('softDelete marca status como baixada', async () => {
    const ar044 = await service.findByPrefixo('AR_044');
    if (!ar044) throw new Error('seed inválido');
    const deleted = await service.softDelete(ar044.id);
    expect(deleted.status).toBe('baixada');
  });

  it('findById lança NotFoundException para id inexistente', async () => {
    await expect(service.findById('inexistente-uuid')).rejects.toThrow(NotFoundException);
  });
});
