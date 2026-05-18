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
    // S2.10.7e — não pre-seed Militar. O auto-upsert (a partir do
    // EfetivoService) deve preencher a tabela durante o sync.
    const efetivo = makeEfetivoStub([
      militar('2967316', '2ºSGT', 'JARDEL DA SILVA', 'JARDEL'),
      militar('3037703', '3ºSGT', 'LOUZADA', 'LOUZADA'),
      militar('4151631', 'CB', 'ESMAEL', 'ESMAEL'),
      militar('4750667', 'SD', 'BORBA', 'BORBA'),
      militar('4152409', 'CB', 'BERGI', 'BERGI'),
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

  it('S2.10.7e — auto-upsert: cria Militar em Postgres a partir do EfetivoService', async () => {
    // Antes do sync, Militar table está vazia (não pre-seed)
    expect(await prisma.militar.findUnique({ where: { nf: '2967316' } })).toBeNull();
    await svc.syncToDatabase();
    // Após sync, JARDEL foi auto-criado
    const jardelMilitar = await prisma.militar.findUnique({ where: { nf: '2967316' } });
    expect(jardelMilitar).not.toBeNull();
    expect((jardelMilitar as { posto: string }).posto).toBe('2ºSGT');
    expect((jardelMilitar as { nomeGuerra: string | null }).nomeGuerra).toBe('JARDEL');
  });

  it('S2.10.7e — sequenciamento: JARDEL VI(04/01) → VII(10/01)', async () => {
    await svc.syncToDatabase();
    const jardel = await prisma.dispensa.findMany({ where: { militarNf: '2967316' } });
    const vi = jardel.find((d) => d.tipo === 'VI_ASSIDUIDADE');
    const vii = jardel.find((d) => d.tipo === 'VII_MERITO');
    expect(vi?.dataInicio).toBe('2026-01-04');
    expect(vii?.dataInicio).toBe('2026-01-10');
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

  it('S2.10.7e — militar nem em Postgres nem no Efetivo → skipped + inconsistência', async () => {
    // Efetivo vazio + Postgres vazio → todas linhas com NF resolvido falham
    const prismaSemSeed = makeDispensasPrismaMock() as typeof prisma;
    // Pré-popular só BORBA em Postgres (FK passa); outros caem no auto-upsert
    // que tenta efetivo vazio → inconsistência.
    prismaSemSeed._seedMilitar('4750667');
    svc = new DispensasImportService(makeConfigStub(), prismaSemSeed, makeEfetivoStub([]));
    const r = await svc.syncToDatabase();
    expect(r.created).toBeGreaterThan(0); // BORBA passa (Postgres já tinha)
    expect(r.skipped).toBeGreaterThan(0); // outros não resolvem nem por NomeMatcher nem por Postgres
    expect(
      r.inconsistencias.some(
        (m) => m.includes('não existe nem em Postgres') || m.includes('Linha sem NF resolvida'),
      ),
    ).toBe(true);
  });
});
