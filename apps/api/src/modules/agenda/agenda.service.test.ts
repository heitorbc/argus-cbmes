import { describe, it, expect, vi } from 'vitest';
import type {
  Atestado,
  Dispensa,
  EscalaEspecialMensal,
  Ferias,
  IseoHospitalEntry,
  MapaForcaDoDia,
  NotaServico,
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

function makeEscalasEspeciais(escala: EscalaEspecialMensal | null) {
  return { get: () => escala } as never;
}

/**
 * S2.10.11a — Stub do EscalasService.listEscaladosDoMilitarNoRange.
 * Recebe lista de entries pré-prontos e devolve filtrados por militarNf.
 * S2.10.11d — Stub também `traceEscalasNoRange` (usado pelo /agenda/_trace).
 */
function makeEscalas(
  porMilitar: Record<
    string,
    Array<{
      data: string;
      equipe: string;
      viatura: string;
      funcao: string;
      origem?: 'composicao' | 'mergulho' | 'salvamar';
      resolvidoPor?: 'nf-salvo' | 'nome-matcher' | 'nao-resolvido';
    }>
  >,
) {
  return {
    listEscaladosDoMilitarNoRange: async (nf: string, inicio: string, fim: string) => {
      const todas = porMilitar[nf] ?? [];
      return todas
        .filter((e) => e.data >= inicio && e.data <= fim)
        .map((e) => ({
          origem: e.origem ?? ('composicao' as const),
          resolvidoPor: e.resolvidoPor ?? ('nf-salvo' as const),
          ...e,
        }));
    },
    traceEscalasNoRange: async () => [],
  } as never;
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
    escalas: makeEscalas({}),
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
  it('S2.10.11a: coleta escalas mensais do militar via EscalasService.listEscaladosDoMilitarNoRange', async () => {
    const data1 = '2026-05-17';
    const data2 = '2026-05-21';
    const deps = emptyDeps();
    deps.escalas = makeEscalas({
      [NF_TARGET]: [
        { data: data1, equipe: 'A', viatura: 'ABTS_01', funcao: 'Motorista' },
        { data: data2, equipe: 'B', viatura: 'AU_154', funcao: 'Operador' },
      ],
    });
    const svc = new AgendaService(
      deps.mf,
      deps.escalas,
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
    const mensais = resp.itens.filter((i) => i.fonte === 'escala_mensal');
    expect(mensais).toHaveLength(2);
    expect(mensais.map((i) => i.data).sort()).toEqual([data1, data2]);
    expect(mensais.find((i) => i.data === data1)?.subtitulo).toContain('ABTS_01');
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
      deps.escalas,
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
    deps.escalas = makeEscalas({
      [NF_TARGET]: [{ data, equipe: 'A', viatura: 'ABTS_01', funcao: 'Motorista' }],
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
      deps.escalas,
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
    deps.escalas = makeEscalas({
      [NF_TARGET]: [
        { data: passada, equipe: 'A', viatura: 'X', funcao: 'F' },
        { data: futura, equipe: 'A', viatura: 'Y', funcao: 'F' },
      ],
    });
    const svc = new AgendaService(
      deps.mf,
      deps.escalas,
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
      deps.escalas,
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
      deps.escalas,
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
      deps.escalas,
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

  it('S2.10.11d: escala especial resolve militarRaw via NomeMatcher quando militarNf é null', async () => {
    const data = '2026-05-23';
    const deps = emptyDeps();
    deps.especiais = makeEscalasEspeciais({
      ano: 2026,
      mes: 5,
      origemArquivo: 'fake.xlsm',
      importadoEm: new Date().toISOString(),
      atos: [
        {
          data,
          militarRaw: '2º SGT BARCELLOS',
          militarNf: undefined,
          horario: '08:00-12:00',
          funcao: 'Instrutor',
        },
      ],
      avisos: [],
    } as never);
    // efetivo permite o NomeMatcher resolver "BARCELLOS" → NF 3037509
    deps.efetivo = {
      getAll: async () => [
        {
          nf: NF_TARGET,
          posto: '2ºSGT',
          nome: 'HEITOR BARCELLOS COELHO',
          nomeGuerra: 'BARCELLOS',
        } as never,
      ],
    } as never;
    const svc = new AgendaService(
      deps.mf,
      deps.escalas,
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
    const especiais = resp.itens.filter((i) => i.fonte === 'escala_especial');
    expect(especiais).toHaveLength(1);
    expect(especiais[0]?.titulo).toContain('Instrutor');
  });

  it('S2.10.11d: traceForMilitar devolve estrutura diagnostic com escalaMensal + escalaEspecial', async () => {
    const data = '2026-05-25';
    const deps = emptyDeps();
    deps.escalas = makeEscalas({
      [NF_TARGET]: [
        {
          data,
          equipe: 'C',
          viatura: 'ABTS 01',
          funcao: 'Motorista',
          origem: 'composicao',
          resolvidoPor: 'nf-salvo',
        },
      ],
    });
    const svc = new AgendaService(
      deps.mf,
      deps.escalas,
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
    const trace = await svc.traceForMilitar(NF_TARGET, data, data);
    expect(trace.nf).toBe(NF_TARGET);
    expect(trace.range.meses).toEqual([{ ano: 2026, mes: 5 }]);
    expect(trace.escalaMensal.entriesDoMilitar).toHaveLength(1);
    expect(trace.escalaMensal.entriesDoMilitar[0]?.viatura).toBe('ABTS 01');
    expect(trace.escalaEspecial.mesesSemEscala).toEqual([{ ano: 2026, mes: 5 }]);
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
      deps.escalas,
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
