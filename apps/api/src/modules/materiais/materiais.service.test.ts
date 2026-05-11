import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { Viatura } from '@argus/shared-types';
import { MateriaisService } from './materiais.service';
import type { ViaturasService } from '../viaturas/viaturas.service';

/**
 * S8 — Tests do MateriaisService. Mocka ViaturasService (apenas o
 * `findByPrefixo` é usado, para resolver o tipo da viatura).
 */
class FakeViaturas {
  private byPrefixo = new Map<string, Viatura>();
  add(prefixo: string, tipo: Viatura['tipo']): void {
    this.byPrefixo.set(prefixo, {
      id: `id-${prefixo}`,
      prefixo,
      tipo,
      status: 'DISPONIVEL',
      composicaoFuncoes: [],
      criadoEm: '2026-01-01T00:00:00Z',
      atualizadoEm: '2026-01-01T00:00:00Z',
    });
  }
  async findByPrefixo(p: string): Promise<Viatura | null> {
    return this.byPrefixo.get(p) ?? null;
  }
}

const NF_CHEFE = '3022269'; // BRUNO MELO

describe('MateriaisService (S8)', () => {
  let viaturas: FakeViaturas;
  let svc: MateriaisService;

  beforeEach(() => {
    viaturas = new FakeViaturas();
    viaturas.add('ABTS 011', 'ABTS');
    viaturas.add('AR 044', 'AR');
    svc = new MateriaisService(viaturas as unknown as ViaturasService);
  });

  it('getChecklistPadrao devolve lista hardcoded por tipo de viatura', async () => {
    const abts = await svc.getChecklistPadrao('ABTS 011');
    expect(abts.length).toBeGreaterThan(0);
    expect(abts).toEqual(expect.arrayContaining(['Mangueira de 38mm × 2', 'Chave de hidrante']));
    const ar = await svc.getChecklistPadrao('AR 044');
    expect(ar).toEqual(expect.arrayContaining(['Maca rígida', 'Colar cervical (3 tamanhos)']));
  });

  it('getChecklistPadrao lança 404 para viatura inexistente', async () => {
    await expect(svc.getChecklistPadrao('XX 999')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('registrar persiste conferência + sobrescreve a anterior da mesma data/vtr', () => {
    const r1 = svc.registrar(
      {
        data: '2026-05-04',
        vtrPrefixo: 'ABTS 011',
        itens: [{ label: 'Mangueira de 38mm × 2', status: 'AUSENTE', observacao: 'Faltou 1' }],
      },
      NF_CHEFE,
    );
    expect(r1.id).toMatch(/^mat:/);
    expect(r1.registradoPorNf).toBe(NF_CHEFE);
    expect(r1.itens[0]!.status).toBe('AUSENTE');

    // Re-registrar mesma data/vtr deve substituir
    const r2 = svc.registrar(
      {
        data: '2026-05-04',
        vtrPrefixo: 'ABTS 011',
        itens: [{ label: 'Mangueira de 38mm × 2', status: 'OK' }],
      },
      NF_CHEFE,
    );
    expect(r2.id).not.toBe(r1.id);
    const persisted = svc.get('2026-05-04', 'ABTS 011');
    expect(persisted?.itens[0]!.status).toBe('OK');
  });

  it('listByData lista todas as viaturas conferidas no dia', () => {
    svc.registrar(
      {
        data: '2026-05-04',
        vtrPrefixo: 'ABTS 011',
        itens: [{ label: 'Chave de hidrante', status: 'OK' }],
      },
      NF_CHEFE,
    );
    svc.registrar(
      {
        data: '2026-05-04',
        vtrPrefixo: 'AR 044',
        itens: [{ label: 'Maca rígida', status: 'DANIFICADO' }],
      },
      NF_CHEFE,
    );
    const all = svc.listByData('2026-05-04');
    expect(all).toHaveLength(2);
  });

  it('listarPendenciasDoDia retorna só itens com status diferente de OK', () => {
    svc.registrar(
      {
        data: '2026-05-04',
        vtrPrefixo: 'ABTS 011',
        itens: [
          { label: 'Mangueira de 38mm × 2', status: 'AUSENTE', observacao: 'Não localizado' },
          { label: 'Chave de hidrante', status: 'OK' },
          { label: 'Esguicho regulável', status: 'DANIFICADO' },
        ],
      },
      NF_CHEFE,
    );
    const pend = svc.listarPendenciasDoDia('2026-05-04');
    expect(pend).toHaveLength(2);
    expect(pend.map((p) => p.label)).toEqual(['Mangueira de 38mm × 2', 'Esguicho regulável']);
    expect(pend[0]!.vtrPrefixo).toBe('ABTS 011');
    expect(pend[0]!.observacao).toBe('Não localizado');
  });
});
