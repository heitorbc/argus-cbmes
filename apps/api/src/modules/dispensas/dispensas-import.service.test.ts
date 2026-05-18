import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Militar } from '@argus/shared-types';
import { makeDispensasPrismaMock } from '../../common/prisma/prisma-test-mock';
import { DispensasImportService } from './dispensas-import.service';

const FIXTURE = readFileSync(join(__dirname, '__fixtures__', 'dispensas-2026-sample.csv'), 'utf-8');

/**
 * Stub mínimo do EfetivoService — só precisa do `getAll` retornando militares
 * conhecidos para o NomeMatcher resolver SD SCARAMUSSA (linha sem NF).
 */
function makeEfetivoStub(militares: Militar[]) {
  return {
    getAll: vi.fn().mockResolvedValue(militares),
  } as unknown as import('../efetivo/efetivo.service').EfetivoService;
}

function militar(nf: string, posto: string, nome: string, nomeGuerra?: string): Militar {
  return {
    nf,
    ant: 100,
    posto,
    nome,
    nomeGuerra,
    subSecao: 'sos',
    funcao: undefined,
  };
}

function makeConfigStub(): ConfigService {
  return {
    get: vi.fn((key: string) => {
      if (key === 'DISPENSAS_PLANILHA_ANO') return '2026';
      return undefined;
    }),
  } as unknown as ConfigService;
}

describe('DispensasImportService (S2.10.7d)', () => {
  let prisma: ReturnType<typeof makeDispensasPrismaMock> & { _seedMilitar: (nf: string) => void };
  let svc: DispensasImportService;

  beforeEach(() => {
    prisma = makeDispensasPrismaMock() as typeof prisma;
    // Pré-popular militares "existentes" no banco para passar no findUnique de FK
    prisma._seedMilitar('2967316'); // JARDEL
    prisma._seedMilitar('3037703'); // LOUZADA
    prisma._seedMilitar('4151631'); // ESMAEL
    prisma._seedMilitar('4750667'); // BORBA
    prisma._seedMilitar('4152409'); // BERGI
    prisma._seedMilitar('9999999'); // SCARAMUSSA via matcher

    const efetivo = makeEfetivoStub([
      militar('2967316', '2ºSGT', 'JARDEL DA SILVA', 'JARDEL'),
      militar('9999999', 'SD', 'SCARAMUSSA SOUZA', 'SCARAMUSSA'),
    ]);

    svc = new DispensasImportService(makeConfigStub(), prisma, efetivo);

    // Stub fetch global pra retornar o CSV fixture
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => FIXTURE,
      } as Response),
    );
  });

  it('syncToDatabase cria registros novos com origem=planilha', async () => {
    const r = await svc.syncToDatabase();
    expect(r.created).toBeGreaterThan(0);
    expect(r.updated).toBe(0);
    expect(r.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Verifica que JARDEL criou 2 (VI + VII) — uma por tipo preenchido
    const jardel = await prisma.dispensa.findMany({ where: { militarNf: '2967316' } });
    expect(jardel).toHaveLength(2);
    const tipos = jardel.map((d) => d.tipo).sort();
    expect(tipos).toEqual(['VII_MERITO', 'VI_ASSIDUIDADE']);
    expect(jardel[0]!.origem).toBe('planilha');
    expect(jardel[0]!.criadoPorNf).toBeNull();
  });

  it('syncToDatabase é idempotente (2 runs = mesmos counts)', async () => {
    const r1 = await svc.syncToDatabase();
    const r2 = await svc.syncToDatabase();
    expect(r2.created).toBe(0); // tudo já criado
    expect(r2.updated).toBe(r1.created); // tudo atualizado no segundo run
    expect(r2.skipped).toBe(r1.skipped);
  });

  it('NomeMatcher resolve linha sem NF (SCARAMUSSA via match no efetivo)', async () => {
    const r = await svc.syncToDatabase();
    const scaramussa = await prisma.dispensa.findMany({ where: { militarNf: '9999999' } });
    expect(scaramussa.length).toBeGreaterThan(0);
    expect(r.skipped).toBe(0);
  });

  it('linhas sem NF E sem match no NomeMatcher viram inconsistência (skipped)', async () => {
    // Recria service sem SCARAMUSSA no efetivo
    const efetivoSemScaramussa = makeEfetivoStub([
      militar('2967316', '2ºSGT', 'JARDEL DA SILVA', 'JARDEL'),
    ]);
    svc = new DispensasImportService(makeConfigStub(), prisma, efetivoSemScaramussa);
    const r = await svc.syncToDatabase();
    expect(r.skipped).toBeGreaterThan(0);
    expect(r.inconsistencias.some((m) => m.includes('SCARAMUSSA'))).toBe(true);
  });

  it('upsert atualiza dias quando planilha mudou (mesma chave militar/data/tipo)', async () => {
    await svc.syncToDatabase();
    // Simular planilha atualizada: JARDEL agora tem VI=10 (era 6)
    const csvAlterado = FIXTURE.replace('"6","2","","","","150829"', '"10","2","","","","150829"');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => csvAlterado,
      } as Response),
    );
    const r2 = await svc.syncToDatabase();
    expect(r2.updated).toBeGreaterThan(0);
    const jardelVI = await prisma.dispensa.findFirst({
      where: { militarNf: '2967316', tipo: 'VI_ASSIDUIDADE' },
    });
    expect(jardelVI?.dias).toBe(10);
  });

  it('getSyncStatus reflete syncedAt + counts da última sync', async () => {
    expect(svc.getSyncStatus().syncedAt).toBeNull();
    await svc.syncToDatabase();
    const s = svc.getSyncStatus();
    expect(s.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(s.counts?.created).toBeGreaterThan(0);
    expect(s.stale).toBe(false);
  });

  it('militar não existe no banco → skipped + inconsistência', async () => {
    // ESMAEL não está pre-seeded → vai pular
    const promiscuPrisma = makeDispensasPrismaMock() as typeof prisma;
    // Pré-popular só BORBA — outros falham na FK
    promiscuPrisma._seedMilitar('4750667');
    svc = new DispensasImportService(makeConfigStub(), promiscuPrisma, makeEfetivoStub([]));
    const r = await svc.syncToDatabase();
    expect(r.created).toBeGreaterThan(0); // BORBA passa
    expect(r.skipped).toBeGreaterThan(0); // outros falham
    expect(r.inconsistencias.some((m) => m.includes('não existe no banco'))).toBe(true);
  });
});
