import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { Militar } from '@argus/shared-types';
import { makeTrocasAutorizadasPrismaMock } from '../../common/prisma/prisma-test-mock';
import { TrocasAutorizadasImportService } from './trocas-autorizadas-import.service';

const HEADER =
  'STATUS TROCA,STATUS NOME,Carimbo de data/hora,Endereço de e-mail,DATA DA ESCALA,' +
  'NÚMERO FUNCIONAL DO ESCALADO,NF DO MILITAR ESCALADO,AUTO Nome Militar Escalado,ESCALADO,' +
  'NÚMERO FUNCIONAL DO SUBSTITUTO,NF DO MILITAR SUBSTITUTO,AUTO Nome Militar Subistituto,SUBSTITUTO,' +
  'FUNÇÃO,HORÁRIO,DATA DO PAGAMENTO,ESCALADO,SUBSTITUTO,FUNÇÃO,HORÁRIO,' +
  'A troca de serviço trata-se de uma dobra de serviço (48h)?,Informe o Nº do E-Docs:,' +
  'NÚMERO FUNCIONAL DO MILITAR ESCALADO,NÚMERO FUNCIONAL DO MILITAR SUBSTITUTO,nº registro da troca';

const ROW_PENDENTE =
  'PENDENTE,NOME OK,13/06/2024 17:08:15,marianegbrumatti@gmail.com,15/06/2024,' +
  ',2984946,2ºSGT MARIANE,SGT MARIANE ,' +
  ',3132170,CB ALVARENGA,CB ALVARENGA,' +
  'MERGULHADOR,7h10 às 18h,29/06/2024,CB ALVARENGA,SGT MARIANE,MERGULHADOR,7h10 às 18h,NÃO,,,,1';

const ROW_VERIFICADO =
  'VERIFICADO,NOME OK,13/06/2024 19:26:27,a@b.com,24/06/2024,' +
  ',4749472,SD AMANDA,SD AMANDA ,' +
  ',3269175,CB IZACK GONCALVES,CB IZACK GONÇALVES ,' +
  'SENTINELA,24h,18/06/2024,CB IZACK GONÇALVES ,SD AMANDA,OPERADOR/SOCORRISTA,24h,NÃO,,,,2';

const CSV_FIXTURE = `${HEADER}\n${ROW_PENDENTE}\n${ROW_VERIFICADO}\n`;

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
  return { get: vi.fn(() => undefined) } as unknown as ConfigService;
}

describe('TrocasAutorizadasImportService (S2.10.8b)', () => {
  let prisma: ReturnType<typeof makeTrocasAutorizadasPrismaMock> & {
    _seedMilitar: (nf: string) => void;
  };
  let svc: TrocasAutorizadasImportService;

  beforeEach(() => {
    prisma = makeTrocasAutorizadasPrismaMock() as typeof prisma;
    const efetivo = makeEfetivoStub([
      militar('2984946', '2ºSGT', 'MARIANE BRUMATTI', 'MARIANE'),
      militar('3132170', 'CB', 'ALVARENGA', 'ALVARENGA'),
      militar('4749472', 'SD', 'AMANDA', 'AMANDA'),
      militar('3269175', 'CB', 'IZACK GONÇALVES', 'IZACK'),
    ]);
    svc = new TrocasAutorizadasImportService(makeConfigStub(), prisma, efetivo);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => CSV_FIXTURE,
      } as Response),
    );
  });

  it('syncToDatabase cria trocas em Postgres (uma por linha válida)', async () => {
    const r = await svc.syncToDatabase();
    expect(r.created).toBe(2); // PENDENTE + VERIFICADO
    expect(r.updated).toBe(0);
    const all = await prisma.trocaAutorizada.findMany();
    expect(all).toHaveLength(2);
  });

  it('é idempotente: 2 runs com mesmo CSV → tudo updated, nada created', async () => {
    await svc.syncToDatabase();
    const r2 = await svc.syncToDatabase();
    expect(r2.created).toBe(0);
    expect(r2.updated).toBe(2);
  });

  it('auto-upsert Militar: cria militares envolvidos a partir do efetivo', async () => {
    await svc.syncToDatabase();
    const mariane = await prisma.militar.findUnique({ where: { nf: '2984946' } });
    const alvarenga = await prisma.militar.findUnique({ where: { nf: '3132170' } });
    expect(mariane).not.toBeNull();
    expect(alvarenga).not.toBeNull();
  });

  it('NF citada na troca mas ausente em Efetivo → inconsistência (não bloqueia troca)', async () => {
    // Recria service sem MARIANE no efetivo
    const efetivoSemMariane = makeEfetivoStub([
      militar('3132170', 'CB', 'ALVARENGA', 'ALVARENGA'),
      militar('4749472', 'SD', 'AMANDA', 'AMANDA'),
      militar('3269175', 'CB', 'IZACK GONÇALVES', 'IZACK'),
    ]);
    svc = new TrocasAutorizadasImportService(makeConfigStub(), prisma, efetivoSemMariane);
    const r = await svc.syncToDatabase();
    expect(r.created).toBe(2); // trocas criadas mesmo assim
    expect(r.inconsistencias.some((m) => m.includes('2984946'))).toBe(true);
  });

  it('getSyncStatus reflete syncedAt + counts da última sync', async () => {
    expect(svc.getSyncStatus().syncedAt).toBeNull();
    await svc.syncToDatabase();
    const s = svc.getSyncStatus();
    expect(s.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(s.counts?.created).toBe(2);
    expect(s.stale).toBe(false);
  });

  it('S2.10.8b-fix: erro no auto-upsert Militar NÃO bloqueia criação das trocas', async () => {
    // Mock prisma.militar.upsert para lançar exceção em todas chamadas
    const upsertOrig = prisma.militar.upsert;
    prisma.militar.upsert = vi.fn().mockRejectedValue(new Error('FK violation simulada'));
    try {
      const r = await svc.syncToDatabase();
      // Trocas DEVEM ser criadas mesmo com upsert Militar falhando
      expect(r.created).toBe(2);
      const all = await prisma.trocaAutorizada.findMany();
      expect(all).toHaveLength(2);
      // Inconsistências registradas mas sync não falhou
      expect(r.inconsistencias.length).toBeGreaterThan(0);
      expect(r.inconsistencias.some((m) => m.includes('FK violation'))).toBe(true);
    } finally {
      prisma.militar.upsert = upsertOrig;
    }
  });

  it('S2.10.8b-fix: falha do EfetivoService NÃO impede sync das trocas', async () => {
    // Recria service com efetivo que lança erro
    const efetivoBroken = {
      getAll: vi.fn().mockRejectedValue(new Error('Timeout efetivo')),
    } as unknown as import('../efetivo/efetivo.service').EfetivoService;
    svc = new TrocasAutorizadasImportService(makeConfigStub(), prisma, efetivoBroken);
    const r = await svc.syncToDatabase();
    // Trocas devem ser criadas mesmo sem efetivo
    expect(r.created).toBe(2);
  });

  it('atualiza row existente quando CSV muda (upsert por id)', async () => {
    await svc.syncToDatabase();
    // Simula planilha alterada: PENDENTE virou VERIFICADO na linha 1
    const csvAlterado = CSV_FIXTURE.replace('PENDENTE,NOME OK', 'VERIFICADO,NOME OK');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => csvAlterado,
      } as Response),
    );
    const r2 = await svc.syncToDatabase();
    expect(r2.updated).toBeGreaterThan(0);
    const all = await prisma.trocaAutorizada.findMany();
    const verificados = all.filter((t) => t.statusTroca === 'VERIFICADO');
    expect(verificados).toHaveLength(2);
  });
});
