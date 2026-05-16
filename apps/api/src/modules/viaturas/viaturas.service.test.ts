import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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

describe('ViaturasService (S6a — nomenclatura MF + bloqueio + novos campos)', () => {
  let service: ViaturasService;

  beforeEach(() => {
    service = makeService();
  });

  it('lista viaturas a partir do MF (ignora recursos sem vtrPrefixo, ex.: GUARDA)', async () => {
    const all = await service.list();
    const prefixos = all.map((v) => v.prefixo);
    expect(prefixos).toContain('ABTS_011');
    expect(prefixos).toContain('AR_044');
    expect(prefixos).toContain('TE_110');
    expect(prefixos).toContain('AM_002');
    expect(prefixos).toContain('AR_031');
    expect(prefixos).toHaveLength(5);
  });

  it('mapeia status com nomenclatura MF: DISPONIVEL/BAIXADA/EMPRESTADA', async () => {
    const all = await service.list();
    expect(all.find((v) => v.prefixo === 'ABTS_011')?.status).toBe('DISPONIVEL');
    expect(all.find((v) => v.prefixo === 'TE_110')?.status).toBe('BAIXADA');
    expect(all.find((v) => v.prefixo === 'AR_031')?.status).toBe('EMPRESTADA');
  });

  it('marca viaturas vindas do MF com origem="mapa_forca"', async () => {
    const all = await service.list();
    expect(all.every((v) => v.origem === 'mapa_forca')).toBe(true);
  });

  it('viatura criada por admin tem origem="override_admin"', async () => {
    const created = await service.create({
      prefixo: 'AB 999',
      tipo: 'AU',
      status: 'DISPONIVEL',
      composicaoFuncoes: ['motorista'],
      funcaoOperacional: 'Teste extra',
    });
    expect(created.origem).toBe('override_admin');
    const all = await service.list();
    expect(all.find((v) => v.prefixo === 'AB 999')?.origem).toBe('override_admin');
  });

  it('S6a/ADR-009 — bloqueia mudança de status em viatura do MF (BadRequest)', async () => {
    const ar044 = await service.findByPrefixo('AR_044');
    if (!ar044) throw new Error('seed inválido');
    await expect(service.update(ar044.id, { status: 'BAIXADA' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.update(ar044.id, { status: 'BAIXADA' })).rejects.toThrow(
      /Conferência da Viatura/,
    );
  });

  it('S6a/ADR-009 — bloqueia mudança de prefixo em viatura do MF', async () => {
    const ar044 = await service.findByPrefixo('AR_044');
    if (!ar044) throw new Error('seed inválido');
    await expect(service.update(ar044.id, { prefixo: 'AR_999' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('S6a — permite editar campos auxiliares (KM, combustível) em viatura do MF', async () => {
    const ar044 = await service.findByPrefixo('AR_044');
    if (!ar044) throw new Error('seed inválido');
    const updated = await service.update(ar044.id, {
      kmAtual: 12500,
      tipoCombustivel: 'diesel',
      usaArla32: true,
      militarResponsavelNf: '3037509',
    });
    expect(updated.kmAtual).toBe(12500);
    expect(updated.tipoCombustivel).toBe('diesel');
    expect(updated.usaArla32).toBe(true);
    expect(updated.militarResponsavelNf).toBe('3037509');
    // Status preservado do MF
    expect(updated.status).toBe('DISPONIVEL');
    expect(updated.origem).toBe('mapa_forca');
  });

  it('S6a — softDelete bloqueado para viatura do MF', async () => {
    const ar044 = await service.findByPrefixo('AR_044');
    if (!ar044) throw new Error('seed inválido');
    await expect(service.softDelete(ar044.id)).rejects.toThrow(BadRequestException);
  });

  it('S6a — softDelete funciona para viatura override_admin', async () => {
    const created = await service.create({
      prefixo: 'AU 999',
      tipo: 'AU',
      status: 'DISPONIVEL',
      composicaoFuncoes: [],
    });
    const deleted = await service.softDelete(created.id);
    expect(deleted.status).toBe('BAIXADA');
  });

  it('rejeita criação com prefixo já existente (vindo do MF)', async () => {
    await expect(
      service.create({
        prefixo: 'ABTS_011',
        tipo: 'ABTS',
        status: 'DISPONIVEL',
        composicaoFuncoes: [],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('findById lança NotFoundException para id inexistente', async () => {
    await expect(service.findById('inexistente-uuid')).rejects.toThrow(NotFoundException);
  });

  it('lista é ordenada por prefixo', async () => {
    const all = await service.list();
    const prefixos = all.map((v) => v.prefixo);
    const sorted = [...prefixos].sort((a, b) => a.localeCompare(b));
    expect(prefixos).toEqual(sorted);
  });
});

describe('ViaturasService (S0.x — histórico KM + upsertByPrefixo)', () => {
  let service: ViaturasService;

  beforeEach(() => {
    service = makeService();
  });

  it('update com kmAtual novo + registradoPorNf gera entrada em historicoKm', async () => {
    const ar044 = await service.findByPrefixo('AR_044');
    if (!ar044) throw new Error('seed inválido');
    expect(ar044.historicoKm).toEqual([]);

    const updated = await service.update(ar044.id, { kmAtual: 12500 }, '3037509');
    expect(updated.historicoKm).toHaveLength(1);
    expect(updated.historicoKm[0]).toMatchObject({
      kmRegistrado: 12500,
      registradoPorNf: '3037509',
      origem: 'manual_admin',
    });
    expect(updated.historicoKm[0]?.registradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('update sem mudança de kmAtual NÃO gera entrada em historicoKm', async () => {
    const ar044 = await service.findByPrefixo('AR_044');
    if (!ar044) throw new Error('seed inválido');
    const updated = await service.update(
      ar044.id,
      { funcaoOperacional: 'RESGATE 01', usaArla32: true },
      '3037509',
    );
    expect(updated.historicoKm).toEqual([]);
  });

  it('update com kmAtual igual ao atual NÃO gera entrada', async () => {
    const ar044 = await service.findByPrefixo('AR_044');
    if (!ar044) throw new Error('seed inválido');
    const after1 = await service.update(ar044.id, { kmAtual: 5000 }, '3037509');
    expect(after1.historicoKm).toHaveLength(1);
    const after2 = await service.update(ar044.id, { kmAtual: 5000 }, '3037509');
    expect(after2.historicoKm).toHaveLength(1);
  });

  it('múltiplas atualizações de KM acumulam entradas em ordem', async () => {
    const ar044 = await service.findByPrefixo('AR_044');
    if (!ar044) throw new Error('seed inválido');
    await service.update(ar044.id, { kmAtual: 5000 }, '3037509');
    await service.update(ar044.id, { kmAtual: 5200 }, '9999999');
    const final = await service.update(ar044.id, { kmAtual: 5500 }, '3037509');
    expect(final.historicoKm).toHaveLength(3);
    expect(final.historicoKm.map((h) => h.kmRegistrado)).toEqual([5000, 5200, 5500]);
    expect(final.historicoKm.map((h) => h.registradoPorNf)).toEqual([
      '3037509',
      '9999999',
      '3037509',
    ]);
  });

  it('update sem registradoPorNf não gera histórico (compat backward)', async () => {
    const ar044 = await service.findByPrefixo('AR_044');
    if (!ar044) throw new Error('seed inválido');
    const updated = await service.update(ar044.id, { kmAtual: 8000 });
    expect(updated.kmAtual).toBe(8000);
    expect(updated.historicoKm).toEqual([]);
  });

  it('upsertByPrefixo cria override quando viatura QDV não tem registro interno', async () => {
    // ABTS_999 não está no seed do MF — simula viatura listada na QDV mas
    // ainda sem override.
    const created = await service.upsertByPrefixo(
      'ABTS_999',
      { funcaoOperacional: 'ABTS_02', kmAtual: 12000 },
      '3037509',
    );
    expect(created.origem).toBe('override_admin');
    expect(created.prefixo).toBe('ABTS_999');
    expect(created.tipo).toBe('ABTS');
    expect(created.status).toBe('DISPONIVEL');
    expect(created.kmAtual).toBe(12000);
    expect(created.historicoKm).toHaveLength(1);
    expect(created.historicoKm[0]).toMatchObject({
      kmRegistrado: 12000,
      registradoPorNf: '3037509',
      origem: 'manual_admin',
    });
  });

  it('upsertByPrefixo atualiza existente quando já há registro', async () => {
    await service.upsertByPrefixo('ABTS_999', { kmAtual: 12000 }, '3037509');
    const updated = await service.upsertByPrefixo('ABTS_999', { kmAtual: 12500 }, '3037509');
    expect(updated.historicoKm).toHaveLength(2);
  });

  it('upsertByPrefixo em viatura MF atualiza override e gera histórico', async () => {
    const result = await service.upsertByPrefixo('AR_044', { kmAtual: 8500 }, '3037509');
    expect(result.origem).toBe('mapa_forca'); // preserva origem MF
    expect(result.kmAtual).toBe(8500);
    expect(result.historicoKm).toHaveLength(1);
  });
});

describe('ViaturasService.aplicarConferencia (S0.x/fixes-3 — KM crescente + admin override)', () => {
  let service: ViaturasService;

  beforeEach(() => {
    service = makeService();
  });

  it('conferência com KM novo crescente gera entrada com origem="conferencia"', async () => {
    const v = await service.aplicarConferencia(
      'AR_044',
      { vtrPrefixo: 'AR_044', kmAtual: 12000, estadoTanquePercent: 80 },
      '3037509',
    );
    expect(v.kmAtual).toBe(12000);
    expect(v.historicoKm).toHaveLength(1);
    expect(v.historicoKm[0]).toMatchObject({
      kmRegistrado: 12000,
      registradoPorNf: '3037509',
      origem: 'conferencia',
    });
  });

  it('conferência com KM igual ao atual NÃO gera entrada nova', async () => {
    await service.aplicarConferencia(
      'AR_044',
      { vtrPrefixo: 'AR_044', kmAtual: 5000, estadoTanquePercent: 80 },
      '3037509',
    );
    const v = await service.aplicarConferencia(
      'AR_044',
      { vtrPrefixo: 'AR_044', kmAtual: 5000, estadoTanquePercent: 75 },
      '3037509',
    );
    expect(v.historicoKm).toHaveLength(1);
  });

  it('conferência com KM < último BLOQUEIA não-admin (BadRequest)', async () => {
    await service.aplicarConferencia(
      'AR_044',
      { vtrPrefixo: 'AR_044', kmAtual: 12000, estadoTanquePercent: 80 },
      '3037509',
    );
    await expect(
      service.aplicarConferencia(
        'AR_044',
        { vtrPrefixo: 'AR_044', kmAtual: 11000, estadoTanquePercent: 70, observacao: 'qualquer' },
        '3037509',
        false, // não-admin
      ),
    ).rejects.toThrow(/menor que o último/);
  });

  it('conferência com KM < último para admin SEM observação BLOQUEIA (BadRequest)', async () => {
    await service.aplicarConferencia(
      'AR_044',
      { vtrPrefixo: 'AR_044', kmAtual: 12000, estadoTanquePercent: 80 },
      '3037509',
    );
    await expect(
      service.aplicarConferencia(
        'AR_044',
        { vtrPrefixo: 'AR_044', kmAtual: 11000, estadoTanquePercent: 70 },
        '3037509',
        true, // admin
      ),
    ).rejects.toThrow(/exige observação obrigatória/);
  });

  it('conferência com KM < último para admin COM observação OK (origem="manual_admin")', async () => {
    await service.aplicarConferencia(
      'AR_044',
      { vtrPrefixo: 'AR_044', kmAtual: 12000, estadoTanquePercent: 80 },
      '3037509',
    );
    const v = await service.aplicarConferencia(
      'AR_044',
      {
        vtrPrefixo: 'AR_044',
        kmAtual: 11000,
        estadoTanquePercent: 70,
        observacao: 'Hodômetro substituído',
      },
      '3037509',
      true,
    );
    expect(v.kmAtual).toBe(11000);
    expect(v.historicoKm).toHaveLength(2);
    expect(v.historicoKm[1]).toMatchObject({
      kmRegistrado: 11000,
      registradoPorNf: '3037509',
      origem: 'manual_admin',
    });
  });

  it('conferência sem kmAtual NÃO gera entrada em historicoKm', async () => {
    const v = await service.aplicarConferencia(
      'AR_044',
      { vtrPrefixo: 'AR_044', estadoTanquePercent: 80, observacao: 'OK' },
      '3037509',
    );
    expect(v.historicoKm).toEqual([]);
    // Mas a observação datada é registrada.
    expect(v.observacoesDataDas).toHaveLength(1);
  });
});
