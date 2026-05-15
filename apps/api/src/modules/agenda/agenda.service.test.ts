import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  ChefeOperacoes,
  ComposicaoEntry,
  EscalaEspecialAto,
  EscalaEspecialMensal,
  IseoHospitalEntry,
  LetraEquipeRotativa,
  NotaServico,
} from '@argus/shared-types';
import { AgendaService } from './agenda.service';

const NF_TARGET = '3037509';

function militar(nf: string, nome: string): ComposicaoEntry['militar'] {
  return { raw: `SD ${nome}`, postoAbreviado: 'SD', nomeGuerra: nome, nf };
}

function makeEscalasMock(
  registry: Record<string, { equipe: LetraEquipeRotativa; entries: ComposicaoEntry[] }>,
) {
  return {
    getEscaladosDoDia: (_ano: number, _mes: number, dataIso: string) =>
      registry[dataIso] ?? { equipe: null, entries: [] },
  } as unknown as Parameters<typeof AgendaService.prototype.forMilitar> extends never
    ? never
    : ConstructorParameters<typeof AgendaService>[0];
}

function makeEscalasEspeciaisMock(escala: EscalaEspecialMensal | null) {
  return {
    get: () => escala,
  } as unknown as ConstructorParameters<typeof AgendaService>[1];
}

function makeNotasServicoMock(notas: NotaServico[]) {
  return {
    list: (filter: { militarNf?: string }) =>
      filter.militarNf ? notas.filter((n) => n.militaresNfs.includes(filter.militarNf!)) : notas,
  } as unknown as ConstructorParameters<typeof AgendaService>[2];
}

function makeChefesOperacoesMock(porDia: Record<string, ChefeOperacoes[]>) {
  return {
    getEscaladosDoDia: async (_ano: number, _mes: number, dia: number) => {
      const key = String(dia).padStart(2, '0');
      return porDia[key] ?? [];
    },
  } as unknown as ConstructorParameters<typeof AgendaService>[3];
}

function makeIseoMock(entries: IseoHospitalEntry[]) {
  return {
    listByMilitar: async (nf: string) => entries.filter((e) => e.nf === nf),
  } as unknown as ConstructorParameters<typeof AgendaService>[4];
}

describe('AgendaService', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('agrega itens de 5 fontes para 1 militar em range de 7 dias', async () => {
    const dataMensal = '2026-05-20';
    const dataEspecial = '2026-05-21';
    const dataNs = '2026-05-22';
    const dataIseo = '2026-05-23';
    const dataChop = '2026-05-24';

    const escalas = makeEscalasMock({
      [dataMensal]: {
        equipe: 'A',
        entries: [
          {
            equipe: 'A',
            viatura: 'ABTS_01',
            funcao: 'Motorista',
            militar: militar(NF_TARGET, 'SCARAMUSSA'),
          },
          {
            equipe: 'A',
            viatura: 'ABTS_01',
            funcao: 'Chefe',
            militar: militar('9999999', 'OUTRO'),
          },
        ],
      },
    });

    const escalaEspecial: EscalaEspecialMensal = {
      mes: 5,
      ano: 2026,
      origemArquivo: 'fake',
      importadoEm: new Date().toISOString(),
      atos: [
        {
          data: dataEspecial,
          militarRaw: 'SD SCARAMUSSA',
          militarNf: NF_TARGET,
          horario: '07:10 ÀS 13:10',
          funcao: 'APOIO',
        } satisfies EscalaEspecialAto,
        {
          data: dataEspecial,
          militarRaw: 'SD OUTRO',
          militarNf: '9999999',
          horario: '07:10 ÀS 13:10',
          funcao: 'APOIO',
        },
      ],
      avisos: [],
    };
    const escalasEspeciais = makeEscalasEspeciaisMock(escalaEspecial);

    const notas: NotaServico[] = [
      {
        id: 'ns1',
        codigo: 'NS123',
        descricao: 'Teste NS',
        data: dataNs,
        horaInicio: '08:00',
        horaFim: '12:00',
        viaturaPrefixo: 'AU 154',
        militaresNfs: [NF_TARGET],
        criadoEm: new Date().toISOString(),
        criadoPorNf: 'admin',
      },
    ];
    const notasMock = makeNotasServicoMock(notas);

    const iseo: IseoHospitalEntry[] = [
      {
        unidade: 'HPM',
        posto: 'SD',
        nome: 'SCARAMUSSA',
        nf: NF_TARGET,
        dataIso: dataIseo,
        turno: 'Diurno',
        funcao: 'Operador',
      },
    ];
    const iseoMock = makeIseoMock(iseo);

    const chopMock = makeChefesOperacoesMock({
      '24': [{ posto: 'CAP', nomeGuerra: 'SCARA', nf: NF_TARGET, marcador: 'X' }],
    });

    const svc = new AgendaService(escalas, escalasEspeciais, notasMock, chopMock, iseoMock);
    const resp = await svc.forMilitar(NF_TARGET, '2026-05-20', '2026-05-26');

    expect(resp.itens.length).toBe(5);
    const fontes = resp.itens.map((i) => i.fonte).sort();
    expect(fontes).toEqual([
      'chefe_operacoes',
      'escala_especial',
      'escala_mensal',
      'iseo_hospitais',
      'nota_servico',
    ]);
    // Ordem cronológica
    expect(resp.itens[0]?.data).toBe(dataMensal);
    expect(resp.itens[4]?.data).toBe(dataChop);
  });

  it('detecta conflito entre escala_mensal e iseo_hospitais no mesmo dia', async () => {
    const data = '2026-05-20';
    const escalas = makeEscalasMock({
      [data]: {
        equipe: 'A',
        entries: [
          {
            equipe: 'A',
            viatura: 'ABTS_01',
            funcao: 'Motorista',
            militar: militar(NF_TARGET, 'SCARAMUSSA'),
          },
        ],
      },
    });
    const escalasEspeciais = makeEscalasEspeciaisMock(null);
    const notasMock = makeNotasServicoMock([]);
    const chopMock = makeChefesOperacoesMock({});
    const iseoMock = makeIseoMock([
      {
        unidade: 'HPM',
        posto: 'SD',
        nome: 'SCARAMUSSA',
        nf: NF_TARGET,
        dataIso: data,
        turno: 'Diurno',
      },
    ]);

    const svc = new AgendaService(escalas, escalasEspeciais, notasMock, chopMock, iseoMock);
    const resp = await svc.forMilitar(NF_TARGET, data, data);

    expect(resp.conflitos.length).toBe(1);
    expect(resp.conflitos[0]?.data).toBe(data);
    expect(resp.conflitos[0]?.itens.length).toBe(2);
  });

  it('proximoItem = primeiro item com data >= hoje', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T12:00:00Z'));

    const dataPassada = '2026-05-19';
    const dataFutura = '2026-05-21';

    const escalas = makeEscalasMock({
      [dataPassada]: {
        equipe: 'A',
        entries: [
          { equipe: 'A', viatura: 'X', funcao: 'F', militar: militar(NF_TARGET, 'X') },
        ],
      },
      [dataFutura]: {
        equipe: 'B',
        entries: [
          { equipe: 'B', viatura: 'Y', funcao: 'F', militar: militar(NF_TARGET, 'X') },
        ],
      },
    });
    const svc = new AgendaService(
      escalas,
      makeEscalasEspeciaisMock(null),
      makeNotasServicoMock([]),
      makeChefesOperacoesMock({}),
      makeIseoMock([]),
    );
    const resp = await svc.forMilitar(NF_TARGET, dataPassada, dataFutura);
    expect(resp.itens.length).toBe(2);
    expect(resp.proximoItem?.data).toBe(dataFutura);
  });

  it('cache devolve mesma resposta dentro do TTL (não chama mocks novamente)', async () => {
    const escalas = makeEscalasMock({});
    const escalasEspeciais = makeEscalasEspeciaisMock(null);
    const notasSpy = vi.fn(() => []);
    const notasMock = { list: notasSpy } as unknown as ConstructorParameters<
      typeof AgendaService
    >[2];
    const chopMock = makeChefesOperacoesMock({});
    const iseoMock = makeIseoMock([]);

    const svc = new AgendaService(escalas, escalasEspeciais, notasMock, chopMock, iseoMock);
    await svc.forMilitar(NF_TARGET, '2026-05-20', '2026-05-21');
    await svc.forMilitar(NF_TARGET, '2026-05-20', '2026-05-21');
    expect(notasSpy).toHaveBeenCalledTimes(1);
  });

  it('range vazio (sem dados em nenhuma fonte) retorna itens=[] + proximoItem=null', async () => {
    const svc = new AgendaService(
      makeEscalasMock({}),
      makeEscalasEspeciaisMock(null),
      makeNotasServicoMock([]),
      makeChefesOperacoesMock({}),
      makeIseoMock([]),
    );
    const resp = await svc.forMilitar(NF_TARGET, '2026-05-20', '2026-05-26');
    expect(resp.itens).toEqual([]);
    expect(resp.proximoItem).toBeNull();
    expect(resp.conflitos).toEqual([]);
  });
});
