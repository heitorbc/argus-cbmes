import { describe, it, expect, vi } from 'vitest';
import type {
  Atestado,
  Dispensa,
  EscalaEspecialMensal,
  Ferias,
  IseoHospitalEntry,
  MapaForcaDoDia,
  NotaServico,
  TripulacaoEntry,
} from '@argus/shared-types';
import { AgendaService } from './agenda.service';

const NF_TARGET = '3037509';
const NOME_TARGET = 'HEITOR BARCELLOS COELHO';

// ── Mocks helpers ─────────────────────────────────────────────────

function makeMapaForca(porData: Record<string, TripulacaoEntry[]>) {
  return {
    getMapaForcaDoDia: async (data: string): Promise<MapaForcaDoDia> => {
      const tripulacao = porData[data] ?? [];
      return {
        data,
        ano: 2026,
        mes: 5,
        equipeRotativa: tripulacao.length > 0 ? 'A' : null,
        equipeMergulho: null,
        equipeSalvamar: null,
        fiscal: null,
        previaState: 'NAO_INICIADO',
        previaPorNf: null,
        previaIniciadaPorNf: undefined,
        previaIniciadaEm: undefined,
        servicoIniciadoEm: undefined,
        servicoIniciadoPorNf: undefined,
        servicoEncerradoEm: undefined,
        servicoEncerradoPorNf: undefined,
        recursos: [],
        tripulacao,
        ideo: [],
        ideoSemMarcacao: [],
        materiaisStatus: { totalRecursos: 0, conferidos: 0, pendentes: 0, ultimoEvento: null },
        notasServico: [],
        composicaoMf: [],
        ajustes: { trocasManuais: [], adicoes: [], remocoes: [] },
        previa: null,
        ajustesNotaServico: [],
        atos: [],
        trocas: [],
        alteracoesDiversas: [],
        ajustesIseo: [],
        estadoServico: 'NAO_INICIADO',
        chefeOperacoes: null,
        viaturasMfStatus: { sincronizadoEm: null, viaturas: [] },
        inconsistencias: [],
      } as unknown as MapaForcaDoDia;
    },
  } as never;
}

function tripEntry(
  viatura: string,
  funcao: string,
  nf: string,
  nome: string,
  isFiscal = false,
): TripulacaoEntry {
  return {
    equipe: 'A',
    viatura,
    funcao,
    militar: { raw: `2ºSGT ${nome}`, postoAbreviado: '2ºSGT', nomeGuerra: nome, nf },
    militarResolvido: {
      nf,
      nome: `2ºSGT BM ${nome}`,
      nomeGuerra: nome,
      posto: '2ºSGT',
      ant: 419,
      situacao: 'ATIVO',
      categoria: 'COMBATENTE',
      unidadeId: '1bbm',
      origem: '1ª1º',
    } as never,
    isFiscal,
  } as never;
}

function makeEscalasEspeciais(escala: EscalaEspecialMensal | null) {
  return { get: () => escala } as never;
}

function makeNotasServico(notas: NotaServico[]) {
  return {
    list: (filter: { militarNf?: string }) =>
      filter.militarNf ? notas.filter((n) => n.militaresNfs.includes(filter.militarNf!)) : notas,
  } as never;
}

function makeChefes(porDia: Record<number, Array<{ nf: string; marcador: string }>>) {
  return {
    getEscaladosDoDia: async (_a: number, _m: number, dia: number) =>
      (porDia[dia] ?? []).map((c) => ({ posto: 'CAP', nomeGuerra: 'X', ...c })),
  } as never;
}

function makeIseo(entries: IseoHospitalEntry[]) {
  return {
    listByMilitar: async (nf: string) => entries.filter((e) => e.nf === nf),
  } as never;
}

function makeAtestados(lista: Atestado[]) {
  return {
    listAtivosNoDia: (data: string) => lista.filter((a) => a.dataInicio === data),
  } as never;
}

function makeDispensas(lista: Dispensa[]) {
  return {
    listAtivasNoDia: (data: string) => lista.filter((d) => d.dataInicio === data),
  } as never;
}

function makeFerias(lista: Ferias[]) {
  return {
    listAtivasNoDia: (data: string) => lista.filter((f) => f.dataInicio === data),
  } as never;
}

function makeTrocas(
  lista: Array<{
    dataEscala: string;
    dataPagamento: string;
    escaladoOriginal: string;
    substituto: string;
    escaladoPagamento: string;
    substitutoPagamento: string;
  }>,
) {
  return { listAll: async () => lista } as never;
}

function makeEfetivo() {
  return { getAll: async () => [] } as never;
}

function emptyDeps() {
  return {
    mf: makeMapaForca({}),
    especiais: makeEscalasEspeciais(null),
    notas: makeNotasServico([]),
    chop: makeChefes({}),
    iseo: makeIseo([]),
    atestados: makeAtestados([]),
    dispensas: makeDispensas([]),
    ferias: makeFerias([]),
    trocas: makeTrocas([]),
    efetivo: makeEfetivo(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('AgendaService', () => {
  it('coleta tripulacao filtrada por NF do MapaForcaService', async () => {
    const data1 = '2026-05-17';
    const data2 = '2026-05-21';
    const deps = emptyDeps();
    deps.mf = makeMapaForca({
      [data1]: [
        tripEntry('ABTS_01', 'Motorista', NF_TARGET, 'HEITOR'),
        tripEntry('ABTS_01', 'Chefe', '9999999', 'OUTRO'),
      ],
      [data2]: [tripEntry('AU_154', 'Operador', NF_TARGET, 'HEITOR', true)],
    });
    const svc = new AgendaService(
      deps.mf,
      deps.especiais,
      deps.notas,
      deps.chop,
      deps.iseo,
      deps.atestados,
      deps.dispensas,
      deps.ferias,
      deps.trocas,
      deps.efetivo,
    );
    const resp = await svc.forMilitar(NF_TARGET, data1, data2, NOME_TARGET);
    expect(resp.itens.filter((i) => i.fonte === 'escala_mensal').length).toBe(2);
    const fiscalItem = resp.itens.find((i) => i.subtitulo?.includes('Fiscal'));
    expect(fiscalItem?.data).toBe(data2);
  });

  it('integra atestado, dispensa, férias do militar', async () => {
    const data = '2026-05-20';
    const deps = emptyDeps();
    deps.atestados = makeAtestados([
      { id: 'at1', militarNf: NF_TARGET, dataInicio: data, dias: 3 } as never,
    ]);
    deps.dispensas = makeDispensas([
      { id: 'di1', militarNf: NF_TARGET, dataInicio: data, dias: 1, tipo: 'I_TAF' } as never,
    ]);
    deps.ferias = makeFerias([
      { id: 'fe1', militarNf: NF_TARGET, dataInicio: data, dias: 30 } as never,
    ]);
    const svc = new AgendaService(
      deps.mf,
      deps.especiais,
      deps.notas,
      deps.chop,
      deps.iseo,
      deps.atestados,
      deps.dispensas,
      deps.ferias,
      deps.trocas,
      deps.efetivo,
    );
    const resp = await svc.forMilitar(NF_TARGET, data, data, NOME_TARGET);
    const fontes = resp.itens.map((i) => i.fonte).sort();
    expect(fontes).toEqual(['atestado', 'dispensa', 'ferias']);
  });

  it('detecta conflito escala_mensal × iseo_hospitais no mesmo dia', async () => {
    const data = '2026-05-29';
    const deps = emptyDeps();
    deps.mf = makeMapaForca({
      [data]: [tripEntry('ABTS_01', 'Motorista', NF_TARGET, 'HEITOR')],
    });
    deps.iseo = makeIseo([
      {
        unidade: 'HPM',
        posto: '2ºSGT',
        nome: 'HEITOR',
        nf: NF_TARGET,
        dataIso: data,
        turno: 'Diurno',
      },
    ]);
    const svc = new AgendaService(
      deps.mf,
      deps.especiais,
      deps.notas,
      deps.chop,
      deps.iseo,
      deps.atestados,
      deps.dispensas,
      deps.ferias,
      deps.trocas,
      deps.efetivo,
    );
    const resp = await svc.forMilitar(NF_TARGET, data, data, NOME_TARGET);
    expect(resp.conflitos.length).toBe(1);
    expect(resp.conflitos[0]?.itens.length).toBe(2);
  });

  it('proximoItem = primeiro item com data >= hoje', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T12:00:00Z'));
    const passada = '2026-05-19';
    const futura = '2026-05-21';
    const deps = emptyDeps();
    deps.mf = makeMapaForca({
      [passada]: [tripEntry('X', 'F', NF_TARGET, 'X')],
      [futura]: [tripEntry('Y', 'F', NF_TARGET, 'X')],
    });
    const svc = new AgendaService(
      deps.mf,
      deps.especiais,
      deps.notas,
      deps.chop,
      deps.iseo,
      deps.atestados,
      deps.dispensas,
      deps.ferias,
      deps.trocas,
      deps.efetivo,
    );
    const resp = await svc.forMilitar(NF_TARGET, passada, futura, NOME_TARGET);
    expect(resp.itens.length).toBe(2);
    expect(resp.proximoItem?.data).toBe(futura);
    vi.useRealTimers();
  });

  it('cache devolve mesma resposta dentro do TTL', async () => {
    const deps = emptyDeps();
    const spy = vi.fn(() => []);
    deps.notas = { list: spy } as never;
    const svc = new AgendaService(
      deps.mf,
      deps.especiais,
      deps.notas,
      deps.chop,
      deps.iseo,
      deps.atestados,
      deps.dispensas,
      deps.ferias,
      deps.trocas,
      deps.efetivo,
    );
    await svc.forMilitar(NF_TARGET, '2026-05-20', '2026-05-21', NOME_TARGET);
    await svc.forMilitar(NF_TARGET, '2026-05-20', '2026-05-21', NOME_TARGET);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('range vazio (sem dados) retorna itens=[] + proximoItem=null', async () => {
    const deps = emptyDeps();
    const svc = new AgendaService(
      deps.mf,
      deps.especiais,
      deps.notas,
      deps.chop,
      deps.iseo,
      deps.atestados,
      deps.dispensas,
      deps.ferias,
      deps.trocas,
      deps.efetivo,
    );
    const resp = await svc.forMilitar(NF_TARGET, '2026-05-20', '2026-05-26', NOME_TARGET);
    expect(resp.itens).toEqual([]);
    expect(resp.proximoItem).toBeNull();
  });

  it('trocas autorizadas: militar como substituto entra como item', async () => {
    const deps = emptyDeps();
    deps.trocas = makeTrocas([
      {
        dataEscala: '2026-05-22',
        dataPagamento: '2026-05-25',
        escaladoOriginal: '2ºSGT FULANO',
        substituto: '2ºSGT HEITOR BARCELLOS COELHO',
        escaladoPagamento: '2ºSGT HEITOR BARCELLOS COELHO',
        substitutoPagamento: '2ºSGT FULANO',
      },
    ]);
    const svc = new AgendaService(
      deps.mf,
      deps.especiais,
      deps.notas,
      deps.chop,
      deps.iseo,
      deps.atestados,
      deps.dispensas,
      deps.ferias,
      deps.trocas,
      deps.efetivo,
    );
    const resp = await svc.forMilitar(NF_TARGET, '2026-05-20', '2026-05-26', NOME_TARGET);
    const trocas = resp.itens.filter((i) => i.fonte === 'troca_autorizada');
    expect(trocas.length).toBe(2); // assume + pagamento
    expect(trocas.map((t) => t.data).sort()).toEqual(['2026-05-22', '2026-05-25']);
  });

  it('S2.10.8c-fix: falha em 1 coletor (dispensas) NÃO derruba a agenda', async () => {
    const data = '2026-05-20';
    const deps = emptyDeps();
    // Coletor de dispensas simula cold boot Supabase falhando.
    deps.dispensas = {
      listAtivasNoDia: async () => {
        throw new Error('prisma.dispensa.findMany timeout — Supabase cold boot');
      },
    } as never;
    // Outras fontes têm dados normais.
    deps.atestados = makeAtestados([
      { id: 'at1', militarNf: NF_TARGET, dataInicio: data, dias: 3 } as never,
    ]);
    const svc = new AgendaService(
      deps.mf,
      deps.especiais,
      deps.notas,
      deps.chop,
      deps.iseo,
      deps.atestados,
      deps.dispensas,
      deps.ferias,
      deps.trocas,
      deps.efetivo,
    );
    // NÃO deve lançar — agenda devolve atestados normalmente, dispensas vira []
    const resp = await svc.forMilitar(NF_TARGET, data, data, NOME_TARGET);
    expect(resp.itens.map((i) => i.fonte)).toEqual(['atestado']);
  });
});
