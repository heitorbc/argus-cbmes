import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { makeDispensasPrismaMock } from '../../common/prisma/prisma-test-mock';
import { DispensasImportService } from './dispensas-import.service';
import { DispensasService } from './dispensas.service';

const NF1 = '3037509';
const NF2 = '3670180';
const sargenteanteNf = '9999999';

/**
 * Stub mínimo do DispensasImportService — `syncIfStale` é fire-and-forget
 * no service real, então o stub no-op não interfere nos tests.
 */
function makeImportStub(): DispensasImportService {
  return {
    syncIfStale: vi.fn().mockResolvedValue(undefined),
    forceSync: vi.fn(),
    syncToDatabase: vi.fn(),
    getSyncStatus: vi.fn(),
  } as unknown as DispensasImportService;
}

describe('DispensasService (S6j/S2.10.7d Prisma)', () => {
  let svc: DispensasService;

  beforeEach(() => {
    const prisma = makeDispensasPrismaMock();
    svc = new DispensasService(prisma, makeImportStub());
  });

  it('create gera id + timestamps + origem manual', async () => {
    const d = await svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-05-10', dias: 4 },
      sargenteanteNf,
    );
    expect(d.id).toMatch(/^disp/);
    expect(d.criadoPorNf).toBe(sargenteanteNf);
    expect(d.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(d.tipo).toBe('I_TAF');
    expect(d.dias).toBe(4);
    expect(d.origem).toBe('manual');
  });

  it('createOrConflict rejeita duplicata exata militar+tipo+dataInicio', async () => {
    await svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-05-10', dias: 4 },
      sargenteanteNf,
    );
    await expect(
      svc.createOrConflict(
        { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-05-10', dias: 4 },
        sargenteanteNf,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('list filtra por militarNf', async () => {
    await svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-05-10', dias: 4 },
      sargenteanteNf,
    );
    await svc.create(
      { militarNf: NF2, tipo: 'V_ANIVERSARIO', dataInicio: '2026-05-12', dias: 1 },
      sargenteanteNf,
    );
    expect(await svc.list({ militarNf: NF1 })).toHaveLength(1);
    expect(await svc.list({ militarNf: NF2 })).toHaveLength(1);
  });

  it('list filtra por ano da dataInicio', async () => {
    await svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2025-12-01', dias: 4 },
      sargenteanteNf,
    );
    await svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-01-15', dias: 4 },
      sargenteanteNf,
    );
    expect(await svc.list({ ano: 2025 })).toHaveLength(1);
    expect(await svc.list({ ano: 2026 })).toHaveLength(1);
  });

  it('listAtivasNoDia retorna dispensas que cobrem a data', async () => {
    // Dispensa 2026-05-10 + 4 dias cobre 10, 11, 12, 13
    await svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-05-10', dias: 4 },
      sargenteanteNf,
    );
    expect(await svc.listAtivasNoDia('2026-05-10')).toHaveLength(1);
    expect(await svc.listAtivasNoDia('2026-05-13')).toHaveLength(1);
    expect(await svc.listAtivasNoDia('2026-05-14')).toHaveLength(0); // exclusive
    expect(await svc.listAtivasNoDia('2026-05-09')).toHaveLength(0);
  });

  it('saldoMilitar agrupa dias por tipo no ano', async () => {
    await svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-03-01', dias: 4 },
      sargenteanteNf,
    );
    await svc.create(
      { militarNf: NF1, tipo: 'V_ANIVERSARIO', dataInicio: '2026-04-15', dias: 1 },
      sargenteanteNf,
    );
    await svc.create(
      { militarNf: NF1, tipo: 'VI_ASSIDUIDADE', dataInicio: '2026-05-10', dias: 6 },
      sargenteanteNf,
    );
    const s = await svc.saldoMilitar(NF1, 2026);
    expect(s.totalGozado).toBe(11);
    const taf = s.saldosPorTipo.find((x) => x.tipo === 'I_TAF')!;
    expect(taf.diasGozados).toBe(4);
    expect(taf.limite).toBe(4);
    expect(taf.diasRestantes).toBe(0);
    const ass = s.saldosPorTipo.find((x) => x.tipo === 'VI_ASSIDUIDADE')!;
    expect(ass.diasRestantes).toBe(0); // 6/6
  });

  it('VIII_DIVERSAS tem limite 999 (sem limite efetivo)', async () => {
    await svc.create(
      { militarNf: NF1, tipo: 'VIII_DIVERSAS', dataInicio: '2026-03-01', dias: 30 },
      sargenteanteNf,
    );
    const s = await svc.saldoMilitar(NF1, 2026);
    const div = s.saldosPorTipo.find((x) => x.tipo === 'VIII_DIVERSAS')!;
    expect(div.limite).toBe(999);
    expect(div.diasRestantes).toBe(969);
  });

  it('S2.10.7d — IX_OUTRAS também tem limite 999 (sem controle de saldo)', async () => {
    await svc.create(
      { militarNf: NF1, tipo: 'IX_OUTRAS', dataInicio: '2026-03-01', dias: 5 },
      sargenteanteNf,
    );
    const s = await svc.saldoMilitar(NF1, 2026);
    const outras = s.saldosPorTipo.find((x) => x.tipo === 'IX_OUTRAS')!;
    expect(outras.limite).toBe(999);
    expect(outras.diasGozados).toBe(5);
  });

  it('S2.10.7d — create aceita campo minuta + equipe', async () => {
    const d = await svc.create(
      {
        militarNf: NF1,
        tipo: 'I_TAF',
        dataInicio: '2026-05-10',
        dias: 4,
        minuta: '150829',
        equipe: 'B',
      },
      sargenteanteNf,
    );
    expect(d.minuta).toBe('150829');
    expect(d.equipe).toBe('B');
  });

  it('update altera campos preservando id e criadoEm', async () => {
    const d = await svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-05-10', dias: 4 },
      sargenteanteNf,
    );
    const updated = await svc.update(d.id, { dias: 3, numeroEdocs: 'EDOCS-001' });
    expect(updated.id).toBe(d.id);
    expect(updated.dias).toBe(3);
    expect(updated.numeroEdocs).toBe('EDOCS-001');
    expect(updated.criadoEm).toBe(d.criadoEm);
  });

  it('remove (soft delete) tira da lista mas mantém row no banco', async () => {
    const d = await svc.create(
      { militarNf: NF1, tipo: 'I_TAF', dataInicio: '2026-05-10', dias: 4 },
      sargenteanteNf,
    );
    await svc.remove(d.id);
    await expect(svc.findById(d.id)).rejects.toThrow(NotFoundException);
    // list() não retorna porque filtra deletedAt: null
    expect(await svc.list()).toHaveLength(0);
  });

  it('findById lança NotFound para id desconhecido', async () => {
    await expect(svc.findById('disp:xpto')).rejects.toThrow(NotFoundException);
  });
});
