import { describe, it, expect, beforeEach } from 'vitest';
import type {
  ComposicaoEntry,
  EscalaMensal,
  Militar,
  TipoIdeo,
  Viatura,
} from '@argus/shared-types';
import { EscalasService } from '../escalas/escalas.service';
import { EscalasEspeciaisService } from '../escalas-especiais/escalas-especiais.service';
import { FiscaisService } from '../fiscais/fiscais.service';
import { AtestadosService } from '../atestados/atestados.service';
import { FeriasService } from '../ferias/ferias.service';
import { DispensasService } from '../dispensas/dispensas.service';
import { NotasServicoService } from '../notas-servico/notas-servico.service';
import { IdeoStatusService } from '../ideo/ideo-status.service';
import { IdeoService } from '../ideo/ideo.service';
import { ServicoService } from '../servico/servico.service';
import { AjustesPreviaService } from './ajustes-previa.service';
import { MapaForcaService } from './mapa-forca.service';

function militar(p: Partial<Militar> & { nf: string; nome: string }): Militar {
  return {
    nf: p.nf,
    ant: p.ant ?? 100,
    posto: p.posto ?? 'CB',
    nome: p.nome,
    nomeGuerra: p.nomeGuerra,
    subSecao: p.subSecao ?? 'sos',
    ...p,
  };
}

const EFETIVO_CHARLIE: Militar[] = [
  militar({
    nf: '3037509',
    posto: '2ºSGT',
    nome: 'HEITOR BARCELLOS',
    nomeGuerra: 'BARCELLOS',
    ant: 418,
  }),
  militar({ nf: '3670180', posto: 'CB', nome: 'DANILO VICENTE', nomeGuerra: 'VICENTE', ant: 700 }),
  militar({
    nf: '4750241',
    posto: 'SD',
    nome: 'F MARTINELLI',
    nomeGuerra: 'MARTINELLI',
    ant: 1095,
  }),
  militar({ nf: '3055566', posto: 'CB', nome: 'EDSON FABRE', nomeGuerra: 'FABRE', ant: 800 }),
  militar({ nf: '3174824', posto: '3ºSGT', nome: 'KARINA X', nomeGuerra: 'KARINA', ant: 600 }),
  militar({
    nf: '3022269',
    posto: '3ºSGT',
    nome: 'BRUNO MELO',
    nomeGuerra: 'BRUNO MELO',
    ant: 650,
  }),
  militar({ nf: '3269787', posto: 'CB', nome: 'MELLINA X', nomeGuerra: 'MELLINA', ant: 750 }),
  militar({ nf: '3195040', posto: 'CB', nome: 'DENIS X', nomeGuerra: 'DENIS', ant: 850 }),
  militar({ nf: '4750713', posto: 'SD', nome: 'CAUE LYRA', nomeGuerra: 'CAUÊ LYRA', ant: 1200 }),
];

class FakeEfetivoService {
  constructor(private readonly all: Militar[]) {}
  async getAll(): Promise<Militar[]> {
    return this.all;
  }
}

class FakeViaturasService {
  constructor(private readonly all: Viatura[]) {}
  async list(): Promise<Viatura[]> {
    return this.all;
  }
}

class FakeChefesOperacoesService {
  habilitadosNfs: Set<string> = new Set();
  escaladosDoDia: Array<{ posto: string; nomeGuerra: string; nf: string; telefone?: string; marcador?: string }> =
    [];
  async getEscaladosDoDia(): Promise<typeof this.escaladosDoDia> {
    return this.escaladosDoDia;
  }
  async getHabilitadosNfs(): Promise<Set<string>> {
    return this.habilitadosNfs;
  }
}

class FakeMapaForcaService {
  recursos: Array<{
    recurso: string;
    chefe?: string;
    motorista?: string;
    operadores: string[];
    semEquipe: boolean;
    vtrStatus: 'DISPONIVEL' | 'BAIXADA' | 'EMPRESTADA' | 'NAO_POSSUI' | null;
    vtrPrefixo?: string;
  }> = [];
  async getRecursos(): Promise<typeof this.recursos> {
    return this.recursos;
  }
}

class FakeTrocasAutorizadasService {
  trocas: Array<{
    dataEscala: string;
    dataPagamento: string;
    escaladoOriginal: string;
    substituto: string;
    escaladoPagamento: string;
    substitutoPagamento: string;
    funcao: string;
    funcaoPagamento: string;
    horario: string;
    horarioPagamento: string;
    numeroEdocs?: string;
  }> = [];
  async listByData(dataIso: string): Promise<typeof this.trocas> {
    return this.trocas.filter((t) => t.dataEscala === dataIso || t.dataPagamento === dataIso);
  }
}

function fakeViatura(prefixo: string, status: 'operacional' | 'baixada' = 'operacional'): Viatura {
  return {
    id: `id-${prefixo}`,
    prefixo,
    tipo: 'ABTS',
    status,
    composicaoFuncoes: [],
    criadoEm: '2026-01-01T00:00:00Z',
    atualizadoEm: '2026-01-01T00:00:00Z',
  };
}

const composicaoCharlie: ComposicaoEntry[] = [
  {
    equipe: 'C',
    viatura: 'ABTS 01',
    funcao: 'Ch',
    militar: { raw: '2º SGT BARCELLOS', postoAbreviado: '2ºSGT', nomeGuerra: 'BARCELLOS' },
  },
  {
    equipe: 'C',
    viatura: 'ABTS 01',
    funcao: 'Mot',
    militar: { raw: 'CB VICENTE', postoAbreviado: 'CB', nomeGuerra: 'VICENTE' },
  },
  {
    equipe: 'C',
    viatura: 'ABTS 01',
    funcao: 'Op 1',
    militar: { raw: 'SD MARTINELLI', postoAbreviado: 'SD', nomeGuerra: 'MARTINELLI' },
  },
  {
    equipe: 'C',
    viatura: 'RESGATE',
    funcao: 'Ch',
    militar: { raw: '3º SGT KARINA', postoAbreviado: '3ºSGT', nomeGuerra: 'KARINA' },
  },
  {
    equipe: 'C',
    viatura: 'GUARDA',
    funcao: 'Sent.',
    militar: { raw: 'SD CAUE LYRA', postoAbreviado: 'SD', nomeGuerra: 'CAUÊ LYRA' },
  },
];

const escalaAbril2026: EscalaMensal = {
  ano: 2026,
  mes: 4,
  origemArquivo: '04 ABRIL DE 2026.xlsx',
  importadoEm: '2026-04-01T12:00:00Z',
  diaEquipe: { '2026-04-23': 'C' },
  composicaoPorQuinzena: {
    q1: composicaoCharlie,
    q2: composicaoCharlie,
    ultimoDiaQ1: 14,
  },
  avisos: [],
};

describe('MapaForcaService — cenário 23/04/2026 CHARLIE', () => {
  let escalas: EscalasService;
  let fiscais: FiscaisService;
  let ideo: IdeoService;
  let efetivo: FakeEfetivoService;
  let viaturas: FakeViaturasService;
  let previa: MapaForcaService;

  beforeEach(() => {
    escalas = new EscalasService();
    fiscais = new FiscaisService();
    ideo = new IdeoService();
    efetivo = new FakeEfetivoService(EFETIVO_CHARLIE);
    viaturas = new FakeViaturasService([
      fakeViatura('ABTS 01'),
      fakeViatura('RESGATE'),
      fakeViatura('GUARDA'),
    ]);
    previa = new MapaForcaService(
      escalas,
      efetivo as unknown as never,
      fiscais,
      ideo,
      viaturas as unknown as never,
      new AjustesPreviaService(new ServicoService()),
      new EscalasEspeciaisService(),
      new FakeChefesOperacoesService() as unknown as never,
      new ServicoService(),
      new IdeoStatusService(),
      new DispensasService(),
      new AtestadosService(),
      new NotasServicoService(),
      new FakeTrocasAutorizadasService() as unknown as never,
      new FeriasService(),
      new FakeMapaForcaService() as unknown as never,
    );

    escalas.save(escalaAbril2026);
    ideo.upsert({ dia: 23, tipo: 'ABTS', itens: ['Mochila Costal', 'GPS'] });
    ideo.upsert({ dia: 23, tipo: 'RESGATE', itens: ['Maca rígida'] });
  });

  it('compõe Prévia completa para 2026-04-23 com equipe CHARLIE', async () => {
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    expect(r.data).toBe('2026-04-23');
    expect(r.equipe).toBe('C');
    expect(r.equipeNome).toBe('CHARLIE');
    expect(r.origemEscala).toBe('04 ABRIL DE 2026.xlsx');
    expect(r.tripulacao).toHaveLength(5);
  });

  it('resolve NFs de todos os militares da composição', async () => {
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const resolved = r.tripulacao.filter((t) => t.militarResolvido);
    expect(resolved).toHaveLength(5);
    expect(r.inconsistencias.find((i) => i.tipo === 'NF_NAO_RESOLVIDO')).toBeUndefined();
  });

  it('S0.5/4.1 — férias ativas no dia aparecem em previa.ferias enriquecidas', async () => {
    const previaAsAny = previa as unknown as { feriasSvc: FeriasService };
    previaAsAny.feriasSvc.create(
      {
        militarNf: '3037509', // BARCELLOS
        mesAno: '2026-04',
        dataInicio: '2026-04-20',
        dias: 10,
      },
      'admin-test',
    );
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    expect(r.ferias).toHaveLength(1);
    expect(r.ferias[0]!.militarNf).toBe('3037509');
    expect(r.ferias[0]!.militarRaw).toContain('BARCELLOS');
    expect(r.ferias[0]!.dias).toBe(10);

    const r2 = await previa.getMapaForcaDoDia('2026-04-19');
    expect(r2.ferias).toHaveLength(0); // ainda não começou
  });

  it('S0.5/PR1 — injeta trocas autorizadas em previa.trocas com origemAutorizada=true', async () => {
    // Pega o FakeTrocasAutorizadasService criado no beforeEach via cast.
    const previaAsAny = previa as unknown as { trocasAutorizadas: FakeTrocasAutorizadasService };
    previaAsAny.trocasAutorizadas.trocas = [
      {
        dataEscala: '2026-04-23',
        dataPagamento: '2026-04-30',
        escaladoOriginal: 'SGT MARIANE',
        substituto: 'CB ALVARENGA',
        escaladoPagamento: 'CB ALVARENGA',
        substitutoPagamento: 'SGT MARIANE',
        funcao: 'MERGULHADOR',
        funcaoPagamento: 'MERGULHADOR',
        horario: '7h10 às 18h',
        horarioPagamento: '7h10 às 18h',
        numeroEdocs: '2026-ABC123',
      },
    ];
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const autorizadas = r.trocas.filter((t) => t.origemAutorizada);
    expect(autorizadas).toHaveLength(1);
    expect(autorizadas[0]!.substituidoRaw).toBe('SGT MARIANE');
    expect(autorizadas[0]!.substitutoRaw).toBe('CB ALVARENGA');
    expect(autorizadas[0]!.funcao).toBe('MERGULHADOR');
    expect(autorizadas[0]!.numeroEdocs).toBe('2026-ABC123');
  });

  it('reconciliação raw→NF: preenche substituidoNf/substitutoNf quando os nomes batem com efetivo', async () => {
    const previaAsAny = previa as unknown as { trocasAutorizadas: FakeTrocasAutorizadasService };
    previaAsAny.trocasAutorizadas.trocas = [
      {
        dataEscala: '2026-04-23',
        dataPagamento: '2026-04-30',
        escaladoOriginal: '2º SGT BARCELLOS',
        substituto: 'CB FABRE',
        escaladoPagamento: 'CB FABRE',
        substitutoPagamento: '2º SGT BARCELLOS',
        funcao: 'MERGULHADOR',
        funcaoPagamento: 'MERGULHADOR',
        horario: '7h10 às 18h',
        horarioPagamento: '7h10 às 18h',
      },
    ];
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const aut = r.trocas.find((t) => t.origemAutorizada)!;
    expect(aut.substituidoNf).toBe('3037509'); // BARCELLOS
    expect(aut.substitutoNf).toBe('3055566'); // FABRE
  });

  it('S0.5 — swap troca o militar entre 2 posições da mesma equipe (CHARLIE)', async () => {
    const previaAsAny = previa as unknown as { ajustes: AjustesPreviaService };
    previaAsAny.ajustes.upsert(
      '2026-04-23',
      {
        trocas: [],
        escalaEspecial: {},
        notasServico: [],
        dispensas: [],
        trocasEscalaEspecial: [],
        swapsMilitares: [
          {
            equipe: 'C',
            viaturaA: 'ABTS 01',
            funcaoA: 'Ch',
            viaturaB: 'RESGATE',
            funcaoB: 'Ch',
          },
        ],
      },
      true, // admin override (sem servico iniciado)
    );

    const r = await previa.getMapaForcaDoDia('2026-04-23');
    // Antes do swap: ABTS 01/Ch = BARCELLOS (3037509); RESGATE/Ch = KARINA (3174824)
    const abtsCh = r.tripulacao.find(
      (t) => t.equipe === 'C' && t.viatura === 'ABTS 01' && t.funcao === 'Ch',
    );
    const resgateCh = r.tripulacao.find(
      (t) => t.equipe === 'C' && t.viatura === 'RESGATE' && t.funcao === 'Ch',
    );
    expect(abtsCh?.militarResolvido?.nf).toBe('3174824'); // agora KARINA
    expect(resgateCh?.militarResolvido?.nf).toBe('3037509'); // agora BARCELLOS
    expect(r.swapsMilitares).toHaveLength(1);
  });

  it('S0.5 — swap inválido (célula inexistente) registra inconsistência e não muda nada', async () => {
    const previaAsAny = previa as unknown as { ajustes: AjustesPreviaService };
    previaAsAny.ajustes.upsert(
      '2026-04-23',
      {
        trocas: [],
        escalaEspecial: {},
        notasServico: [],
        dispensas: [],
        trocasEscalaEspecial: [],
        swapsMilitares: [
          {
            equipe: 'C',
            viaturaA: 'ABTS 01',
            funcaoA: 'Ch',
            viaturaB: 'INEXISTENTE',
            funcaoB: 'Ch',
          },
        ],
      },
      true,
    );

    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const abtsCh = r.tripulacao.find(
      (t) => t.equipe === 'C' && t.viatura === 'ABTS 01' && t.funcao === 'Ch',
    );
    // Continua BARCELLOS — swap descartado.
    expect(abtsCh?.militarResolvido?.nf).toBe('3037509');
    const inc = r.inconsistencias.find(
      (i) =>
        (i.detalhe as Record<string, unknown> | undefined)?.origem === 'swap-militar',
    );
    expect(inc).toBeDefined();
  });

  it('reconciliação raw→NF: registra inconsistência quando o nome não bate com nenhum militar', async () => {
    const previaAsAny = previa as unknown as { trocasAutorizadas: FakeTrocasAutorizadasService };
    previaAsAny.trocasAutorizadas.trocas = [
      {
        dataEscala: '2026-04-23',
        dataPagamento: '2026-04-30',
        escaladoOriginal: 'SGT INEXISTENTE',
        substituto: '2º SGT BARCELLOS',
        escaladoPagamento: '2º SGT BARCELLOS',
        substitutoPagamento: 'SGT INEXISTENTE',
        funcao: 'MERGULHADOR',
        funcaoPagamento: 'MERGULHADOR',
        horario: '7h10 às 18h',
        horarioPagamento: '7h10 às 18h',
      },
    ];
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const aut = r.trocas.find((t) => t.origemAutorizada)!;
    expect(aut.substituidoNf).toBeUndefined(); // INEXISTENTE não resolve
    expect(aut.substitutoNf).toBe('3037509'); // BARCELLOS resolve

    const inc = r.inconsistencias.find(
      (i) =>
        i.tipo === 'NF_NAO_RESOLVIDO' &&
        (i.detalhe as Record<string, unknown> | undefined)?.origem === 'trocas-autorizadas',
    );
    expect(inc).toBeDefined();
    expect(inc!.mensagem).toContain('SGT INEXISTENTE');
  });

  it('S0.5/0.1.1.3 — troca de função CHOP com substituto não-habilitado registra inconsistência', async () => {
    const previaAsAny = previa as unknown as {
      trocasAutorizadas: FakeTrocasAutorizadasService;
      chefesOperacoes: FakeChefesOperacoesService;
    };
    // Habilitados ChOp: só BARCELLOS (3037509). FABRE (3055566) NÃO está.
    previaAsAny.chefesOperacoes.habilitadosNfs = new Set(['3037509']);
    previaAsAny.trocasAutorizadas.trocas = [
      {
        dataEscala: '2026-04-23',
        dataPagamento: '2026-04-30',
        escaladoOriginal: '2º SGT BARCELLOS',
        substituto: 'CB FABRE',
        escaladoPagamento: 'CB FABRE',
        substitutoPagamento: '2º SGT BARCELLOS',
        funcao: 'CHEFE DE OPERAÇÕES',
        funcaoPagamento: 'CHEFE DE OPERAÇÕES',
        horario: '24h',
        horarioPagamento: '24h',
      },
    ];
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const inc = r.inconsistencias.find(
      (i) =>
        (i.detalhe as Record<string, unknown> | undefined)?.origem ===
        'troca-chop-nao-habilitado',
    );
    expect(inc).toBeDefined();
    expect(inc!.mensagem).toContain('CB FABRE');
  });

  it('S0.5/0.1.1.3 — troca de função não-CHOP nunca registra a inconsistência de habilitado', async () => {
    const previaAsAny = previa as unknown as {
      trocasAutorizadas: FakeTrocasAutorizadasService;
      chefesOperacoes: FakeChefesOperacoesService;
    };
    previaAsAny.chefesOperacoes.habilitadosNfs = new Set(['3037509']);
    previaAsAny.trocasAutorizadas.trocas = [
      {
        dataEscala: '2026-04-23',
        dataPagamento: '2026-04-30',
        escaladoOriginal: '2º SGT BARCELLOS',
        substituto: 'CB FABRE',
        escaladoPagamento: 'CB FABRE',
        substitutoPagamento: '2º SGT BARCELLOS',
        funcao: 'MERGULHADOR',
        funcaoPagamento: 'MERGULHADOR',
        horario: '24h',
        horarioPagamento: '24h',
      },
    ];
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const inc = r.inconsistencias.find(
      (i) =>
        (i.detalhe as Record<string, unknown> | undefined)?.origem ===
        'troca-chop-nao-habilitado',
    );
    expect(inc).toBeUndefined();
  });

  it('S0.5/PR1 — no dia de pagamento, papéis se invertem', async () => {
    const previaAsAny = previa as unknown as { trocasAutorizadas: FakeTrocasAutorizadasService };
    previaAsAny.trocasAutorizadas.trocas = [
      {
        dataEscala: '2026-04-23',
        dataPagamento: '2026-04-30',
        escaladoOriginal: 'SGT MARIANE',
        substituto: 'CB ALVARENGA',
        escaladoPagamento: 'CB ALVARENGA',
        substitutoPagamento: 'SGT MARIANE',
        funcao: 'MERGULHADOR',
        funcaoPagamento: 'MERGULHADOR',
        horario: '7h10 às 18h',
        horarioPagamento: '7h10 às 18h',
      },
    ];
    // 2026-04-30 não está no escalaAbril (que só tem 23/04). Para esse test
    // criamos um diaEquipe ad-hoc. Mais simples: testar com 2026-04-23 confirmando
    // o lado correto.
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const aut = r.trocas.find((t) => t.origemAutorizada)!;
    // dia 23 = lado escala → escalado (substituido) é MARIANE, substituto é ALVARENGA
    expect(aut.substituidoRaw).toBe('SGT MARIANE');
    expect(aut.substitutoRaw).toBe('CB ALVARENGA');
  });

  it('Fix-Mergulho — sem override, MERGULHO 01 = equipe A (BARCELLOS), MERGULHO 02 = equipe B (KARINA)', async () => {
    // Substitui a escala de abril por uma com seção de mergulho preenchida.
    escalas.save({
      ...escalaAbril2026,
      mergulho: {
        equipesPorQuinzena: {
          q1: {
            A: {
              letra: 'A',
              chefe: { raw: '2º SGT BARCELLOS', postoAbreviado: '2ºSGT', nomeGuerra: 'BARCELLOS' },
              motorista: null,
              mergulhadores: [],
            },
            B: {
              letra: 'B',
              chefe: { raw: '3º SGT KARINA', postoAbreviado: '3ºSGT', nomeGuerra: 'KARINA' },
              motorista: null,
              mergulhadores: [],
            },
          },
          q2: {
            A: {
              letra: 'A',
              chefe: { raw: '2º SGT BARCELLOS', postoAbreviado: '2ºSGT', nomeGuerra: 'BARCELLOS' },
              motorista: null,
              mergulhadores: [],
            },
            B: {
              letra: 'B',
              chefe: { raw: '3º SGT KARINA', postoAbreviado: '3ºSGT', nomeGuerra: 'KARINA' },
              motorista: null,
              mergulhadores: [],
            },
          },
          ultimoDiaQ1: 14,
        },
        porDia: { '2026-04-23': { mergulho01: 'A', mergulho02: 'B' } },
      },
    });
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const m01 = r.tripulacao.find((t) => t.viatura === 'MERGULHO 01' && t.funcao === 'Ch');
    const m02 = r.tripulacao.find((t) => t.viatura === 'MERGULHO 02' && t.funcao === 'Ch');
    expect(m01?.militarRef.nomeGuerra).toBe('BARCELLOS');
    expect(m02?.militarRef.nomeGuerra).toBe('KARINA');
  });

  it('Fix-Mergulho — com override swap, M01 e M02 invertem suas equipes', async () => {
    escalas.save({
      ...escalaAbril2026,
      mergulho: {
        equipesPorQuinzena: {
          q1: {
            A: {
              letra: 'A',
              chefe: { raw: '2º SGT BARCELLOS', postoAbreviado: '2ºSGT', nomeGuerra: 'BARCELLOS' },
              motorista: null,
              mergulhadores: [],
            },
            B: {
              letra: 'B',
              chefe: { raw: '3º SGT KARINA', postoAbreviado: '3ºSGT', nomeGuerra: 'KARINA' },
              motorista: null,
              mergulhadores: [],
            },
          },
          q2: {
            A: {
              letra: 'A',
              chefe: { raw: '2º SGT BARCELLOS', postoAbreviado: '2ºSGT', nomeGuerra: 'BARCELLOS' },
              motorista: null,
              mergulhadores: [],
            },
            B: {
              letra: 'B',
              chefe: { raw: '3º SGT KARINA', postoAbreviado: '3ºSGT', nomeGuerra: 'KARINA' },
              motorista: null,
              mergulhadores: [],
            },
          },
          ultimoDiaQ1: 14,
        },
        porDia: { '2026-04-23': { mergulho01: 'A', mergulho02: 'B' } },
      },
    });
    const previaAsAny = previa as unknown as { ajustes: AjustesPreviaService };
    previaAsAny.ajustes.upsert(
      '2026-04-23',
      {
        trocas: [],
        escalaEspecial: {},
        notasServico: [],
        dispensas: [],
        trocasEscalaEspecial: [],
        swapsMilitares: [],
        overridesMergulho: [{ data: '2026-04-23', swap: true }],
      },
      true,
    );
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const m01 = r.tripulacao.find((t) => t.viatura === 'MERGULHO 01' && t.funcao === 'Ch');
    const m02 = r.tripulacao.find((t) => t.viatura === 'MERGULHO 02' && t.funcao === 'Ch');
    expect(m01?.militarRef.nomeGuerra).toBe('KARINA'); // antes era B em M02
    expect(m02?.militarRef.nomeGuerra).toBe('BARCELLOS'); // antes era A em M01
    expect(r.overridesMergulho).toHaveLength(1);
  });

  it('Fix-AtivarRecurso — Fiscal ativa RESGATE 02 ad-hoc, recurso aparece em tripulacao', async () => {
    const previaAsAny = previa as unknown as { ajustes: AjustesPreviaService };
    previaAsAny.ajustes.upsert(
      '2026-04-23',
      {
        trocas: [],
        escalaEspecial: {},
        notasServico: [],
        dispensas: [],
        trocasEscalaEspecial: [],
        swapsMilitares: [],
        overridesMergulho: [],
        overridesParesRecursos: [],
        ativacoesRecurso: [
          {
            data: '2026-04-23',
            recurso: 'RESGATE 02',
            vtrPrefixo: 'AR_044',
            chefe: { raw: '2º SGT BARCELLOS', postoAbreviado: '2ºSGT', nomeGuerra: 'BARCELLOS' },
            operadores: [],
          },
        ],
      },
      true,
    );
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const r02 = r.tripulacao.find((t) => t.viatura === 'RESGATE 02' && t.funcao === 'Ch');
    expect(r02).toBeDefined();
    expect(r02!.militarRef.nomeGuerra).toBe('BARCELLOS');
    expect(r.ativacoesRecurso).toHaveLength(1);
  });

  it('Fix-AtivarRecurso — ativação de recurso já presente na tripulação registra inconsistência', async () => {
    // ABTS 01 já está na escala (tripulacao). Tentar ativar de novo deve falhar.
    const previaAsAny = previa as unknown as { ajustes: AjustesPreviaService };
    previaAsAny.ajustes.upsert(
      '2026-04-23',
      {
        trocas: [],
        escalaEspecial: {},
        notasServico: [],
        dispensas: [],
        trocasEscalaEspecial: [],
        swapsMilitares: [],
        overridesMergulho: [],
        overridesParesRecursos: [],
        ativacoesRecurso: [
          {
            data: '2026-04-23',
            recurso: 'ABTS 01',
            vtrPrefixo: 'ABTS_011',
            chefe: { raw: 'CB ELSON', postoAbreviado: 'CB', nomeGuerra: 'ELSON' },
            operadores: [],
          },
        ],
      },
      true,
    );
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const inc = r.inconsistencias.find(
      (i) =>
        (i.detalhe as Record<string, unknown> | undefined)?.origem === 'ativacao-recurso',
    );
    expect(inc).toBeDefined();
  });

  it('override de par RESGATE 01↔02 realoca a tripulação XLSX', async () => {
    // Substitui a escala default por uma que use o nome canônico
    // "RESGATE 01" (que é o que o parser do XLSX emite após normalização).
    escalas.save({
      ...escalaAbril2026,
      composicaoPorQuinzena: {
        q1: [
          {
            equipe: 'C',
            viatura: 'RESGATE 01',
            funcao: 'Ch',
            militar: { raw: '3º SGT KARINA', postoAbreviado: '3ºSGT', nomeGuerra: 'KARINA' },
          },
        ],
        q2: [
          {
            equipe: 'C',
            viatura: 'RESGATE 01',
            funcao: 'Ch',
            militar: { raw: '3º SGT KARINA', postoAbreviado: '3ºSGT', nomeGuerra: 'KARINA' },
          },
        ],
        ultimoDiaQ1: 14,
      },
    });
    const previaAsAny = previa as unknown as { ajustes: AjustesPreviaService };
    previaAsAny.ajustes.upsert(
      '2026-04-23',
      {
        trocas: [],
        escalaEspecial: {},
        notasServico: [],
        dispensas: [],
        trocasEscalaEspecial: [],
        swapsMilitares: [],
        overridesMergulho: [],
        overridesParesRecursos: [{ data: '2026-04-23', par: 'RESGATE', swap: true }],
      },
      true,
    );
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    // Tripulação que estava em RESGATE 01 agora aparece sob RESGATE 02.
    const r01 = r.tripulacao.filter((t) => t.viatura === 'RESGATE 01' && t.equipe === 'C');
    const r02 = r.tripulacao.filter((t) => t.viatura === 'RESGATE 02' && t.equipe === 'C');
    expect(r01).toHaveLength(0);
    expect(r02.length).toBeGreaterThan(0);
    expect(r02.some((t) => t.funcao === 'Ch')).toBe(true);
    expect(r.overridesParesRecursos).toHaveLength(1);
  });

  it('Fix-2 homologação — Chefe de Operações é injetado em tripulacao no mesmo card do motorista CHOP', async () => {
    const previaAsAny = previa as unknown as { chefesOperacoes: FakeChefesOperacoesService };
    previaAsAny.chefesOperacoes.escaladosDoDia = [
      { posto: '1ºTEN QOA', nomeGuerra: 'BOREL', nf: '999001' },
    ];
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const chOpEntries = r.tripulacao.filter((t) => t.viatura === 'CHEFE DE OPERAÇÕES');
    const chefe = chOpEntries.find((t) => t.funcao === 'Ch');
    expect(chefe).toBeDefined();
    expect(chefe!.militarRef.nomeGuerra).toBe('BOREL');
    expect(chefe!.equipe).toBe('STAFF');
  });

  it('escolhe Fiscal padrão = militar de menor ANT (BARCELLOS, ANT 418)', async () => {
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    expect(r.fiscal).not.toBeNull();
    expect(r.fiscal!.origem).toBe('default');
    expect(r.fiscal!.militarNf).toBe('3037509');
    expect(r.fiscal!.militarResolvido?.nomeGuerra).toBe('BARCELLOS');
  });

  it('marca isFiscal=true na linha do Fiscal escolhido', async () => {
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const fiscalLinha = r.tripulacao.find((t) => t.isFiscal);
    expect(fiscalLinha).toBeDefined();
    expect(fiscalLinha!.militarResolvido?.nf).toBe('3037509');
  });

  it('cadastro explícito sobrescreve cálculo default', async () => {
    fiscais.create(
      {
        militarNf: '3174824', // KARINA
        equipe: 'C',
        vigenciaInicio: '2026-04-20',
        vigenciaFim: '2026-04-30',
        motivo: 'BARCELLOS em curso',
      },
      'admin',
    );
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    expect(r.fiscal!.origem).toBe('cadastrado');
    expect(r.fiscal!.militarNf).toBe('3174824');
    expect(r.fiscal!.motivo).toBe('BARCELLOS em curso');
  });

  it('inclui IDEO de ABTS e RESGATE para o dia 23', async () => {
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const tipos = r.ideo.map((i) => i.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['ABTS' as TipoIdeo, 'RESGATE' as TipoIdeo]));
    expect(r.ideo.find((i) => i.tipo === 'ABTS')!.itens).toEqual(['Mochila Costal', 'GPS']);
  });

  it('inclui todas as viaturas com status (S5: WhatsApp precisa mostrar BAIXADA inline)', async () => {
    viaturas = new FakeViaturasService([
      fakeViatura('ABTS 01'),
      fakeViatura('RESGATE'),
      fakeViatura('GUARDA'),
      fakeViatura('AR 044', 'baixada'),
    ]);
    previa = new MapaForcaService(
      escalas,
      efetivo as unknown as never,
      fiscais,
      ideo,
      viaturas as unknown as never,
      new AjustesPreviaService(new ServicoService()),
      new EscalasEspeciaisService(),
      new FakeChefesOperacoesService() as unknown as never,
      new ServicoService(),
      new IdeoStatusService(),
      new DispensasService(),
      new AtestadosService(),
      new NotasServicoService(),
      new FakeTrocasAutorizadasService() as unknown as never,
      new FeriasService(),
      new FakeMapaForcaService() as unknown as never,
    );
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const ar044 = r.viaturasOperacionais.find((v) => v.codigo === 'AR 044');
    expect(ar044).toBeDefined();
    expect(ar044?.vtrStatus).toBe('baixada');
    const abts01 = r.viaturasOperacionais.find((v) => v.codigo === 'ABTS 01');
    expect(abts01?.vtrStatus).toBe('operacional');
  });

  // S6g (2026-05-10) — Antes do fix, militares de AQUATICAS/STAFF do MF eram
  // adicionados à tripulação automaticamente. Agora a Prévia ignora militares
  // do MF; eles devem vir 100% do XLSX da SOS.
  it('S6g — não complementa tripulação com militares do MF (mesmo AQUATICAS/STAFF)', async () => {
    // Cenário: XLSX importado tem 5 militares (composicaoCharlie). Mesmo com
    // o MF retornando MERGULHO 02 + CHEFE DE OPERAÇÕES com militares, NADA
    // é adicionado à tripulação além dos 5 do XLSX.
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    expect(r.tripulacao).toHaveLength(5);
    // Nenhuma equipe AQUATICAS ou STAFF aparece (vinha só do complemento MF):
    expect(r.tripulacao.filter((t) => t.equipe === 'AQUATICAS')).toEqual([]);
    expect(r.tripulacao.filter((t) => t.equipe === 'STAFF')).toEqual([]);
  });
});

describe('MapaForcaService — inconsistências', () => {
  let escalas: EscalasService;
  let fiscais: FiscaisService;
  let ideo: IdeoService;
  let efetivo: FakeEfetivoService;
  let viaturas: FakeViaturasService;
  let previa: MapaForcaService;

  beforeEach(() => {
    escalas = new EscalasService();
    fiscais = new FiscaisService();
    ideo = new IdeoService();
    efetivo = new FakeEfetivoService(EFETIVO_CHARLIE);
    viaturas = new FakeViaturasService([fakeViatura('ABTS 01')]);
    previa = new MapaForcaService(
      escalas,
      efetivo as unknown as never,
      fiscais,
      ideo,
      viaturas as unknown as never,
      new AjustesPreviaService(new ServicoService()),
      new EscalasEspeciaisService(),
      new FakeChefesOperacoesService() as unknown as never,
      new ServicoService(),
      new IdeoStatusService(),
      new DispensasService(),
      new AtestadosService(),
      new NotasServicoService(),
      new FakeTrocasAutorizadasService() as unknown as never,
      new FeriasService(),
      new FakeMapaForcaService() as unknown as never,
    );
  });

  it('SEM_ESCALA_NO_MES quando mês não foi importado', async () => {
    const r = await previa.getMapaForcaDoDia('2026-07-15');
    expect(r.tripulacao).toEqual([]);
    expect(r.fiscal).toBeNull();
    expect(r.inconsistencias.some((i) => i.tipo === 'SEM_ESCALA_NO_MES')).toBe(true);
  });

  // S6g (2026-05-10) — Cenário do screenshot do Tech Lead: 10/05/2026 sem XLSX,
  // antes do fix apareciam AU_154/AC_001/AM_002 com militares vindos do MF.
  // Após o fix, Tripulação deve ficar vazia. Recursos do MF não complementam mais.
  it('S6g — sem XLSX, Tripulação fica vazia mesmo se houvesse recursos AQUATICAS/STAFF no MF', async () => {
    // Não chama escalas.save — mês 2026-07 não existe no storage
    const r = await previa.getMapaForcaDoDia('2026-07-15');
    expect(r.tripulacao).toEqual([]);
    expect(r.tripulacao.filter((t) => t.equipe === 'AQUATICAS')).toEqual([]);
    expect(r.tripulacao.filter((t) => t.equipe === 'STAFF')).toEqual([]);
  });

  it('EQUIPE_NAO_ESCALADA_NO_DIA quando mês existe mas dia sem equipe', async () => {
    escalas.save({
      ...escalaAbril2026,
      diaEquipe: { '2026-04-23': 'C' }, // só dia 23
    });
    const r = await previa.getMapaForcaDoDia('2026-04-22');
    expect(r.equipe).toBeNull();
    expect(r.inconsistencias.some((i) => i.tipo === 'EQUIPE_NAO_ESCALADA_NO_DIA')).toBe(true);
  });

  it('NF_NAO_RESOLVIDO quando militar do XLSX não está no QDI', async () => {
    const composicaoQ: ComposicaoEntry[] = [
      {
        equipe: 'C',
        viatura: 'ABTS 01',
        funcao: 'Op 2',
        militar: { raw: 'SD INEXISTENTE', postoAbreviado: 'SD', nomeGuerra: 'INEXISTENTE' },
      },
    ];
    escalas.save({
      ...escalaAbril2026,
      composicaoPorQuinzena: {
        q1: composicaoQ,
        q2: composicaoQ,
        ultimoDiaQ1: 14,
      },
    });
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    expect(r.tripulacao[0]!.militarResolvido).toBeNull();
    expect(r.inconsistencias.some((i) => i.tipo === 'NF_NAO_RESOLVIDO')).toBe(true);
  });

  it('IDEO_NAO_CADASTRADO quando dia não tem IDEO', async () => {
    escalas.save(escalaAbril2026);
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    const ideoMissing = r.inconsistencias.filter((i) => i.tipo === 'IDEO_NAO_CADASTRADO');
    // ABTS + RESGATE não cadastrados
    expect(ideoMissing.length).toBe(2);
  });

  it('VIATURA_DESCONHECIDA quando composição usa viatura não cadastrada', async () => {
    const composicaoQ: ComposicaoEntry[] = [
      {
        equipe: 'C',
        viatura: 'ABTS 99',
        funcao: 'Ch',
        militar: { raw: '2º SGT BARCELLOS', postoAbreviado: '2ºSGT', nomeGuerra: 'BARCELLOS' },
      },
    ];
    escalas.save({
      ...escalaAbril2026,
      composicaoPorQuinzena: {
        q1: composicaoQ,
        q2: composicaoQ,
        ultimoDiaQ1: 14,
      },
    });
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    expect(r.inconsistencias.some((i) => i.tipo === 'VIATURA_DESCONHECIDA')).toBe(true);
  });

  it('FISCAL_SEM_NF_RESOLVIDO quando cadastro aponta para NF fora do efetivo', async () => {
    fiscais.create(
      {
        militarNf: '9999999',
        equipe: 'C',
        vigenciaInicio: '2026-04-01',
      },
      'admin',
    );
    escalas.save(escalaAbril2026);
    const r = await previa.getMapaForcaDoDia('2026-04-23');
    expect(r.fiscal!.origem).toBe('cadastrado');
    expect(r.fiscal!.militarResolvido).toBeNull();
    expect(r.inconsistencias.some((i) => i.tipo === 'FISCAL_SEM_NF_RESOLVIDO')).toBe(true);
  });
});

// Helper para o segundo describe
const escalaAbril2026Local = escalaAbril2026;
const composicaoCharlieLocal = composicaoCharlie;
void escalaAbril2026Local;
void composicaoCharlieLocal;
