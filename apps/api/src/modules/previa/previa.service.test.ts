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
import { DispensasService } from '../dispensas/dispensas.service';
import { IdeoStatusService } from '../ideo/ideo-status.service';
import { IdeoService } from '../ideo/ideo.service';
import { ServicoService } from '../servico/servico.service';
import { AjustesPreviaService } from './ajustes-previa.service';
import { PreviaService } from './previa.service';

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
  async getEscaladosDoDia(): Promise<readonly never[]> {
    return [];
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
  composicao: composicaoCharlie,
  avisos: [],
};

describe('PreviaService — cenário 23/04/2026 CHARLIE', () => {
  let escalas: EscalasService;
  let fiscais: FiscaisService;
  let ideo: IdeoService;
  let efetivo: FakeEfetivoService;
  let viaturas: FakeViaturasService;
  let previa: PreviaService;

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
    previa = new PreviaService(
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
    );

    escalas.save(escalaAbril2026);
    ideo.upsert({ dia: 23, tipo: 'ABTS', itens: ['Mochila Costal', 'GPS'] });
    ideo.upsert({ dia: 23, tipo: 'RESGATE', itens: ['Maca rígida'] });
  });

  it('compõe Prévia completa para 2026-04-23 com equipe CHARLIE', async () => {
    const r = await previa.getPreviaDoDia('2026-04-23');
    expect(r.data).toBe('2026-04-23');
    expect(r.equipe).toBe('C');
    expect(r.equipeNome).toBe('CHARLIE');
    expect(r.origemEscala).toBe('04 ABRIL DE 2026.xlsx');
    expect(r.tripulacao).toHaveLength(5);
  });

  it('resolve NFs de todos os militares da composição', async () => {
    const r = await previa.getPreviaDoDia('2026-04-23');
    const resolved = r.tripulacao.filter((t) => t.militarResolvido);
    expect(resolved).toHaveLength(5);
    expect(r.inconsistencias.find((i) => i.tipo === 'NF_NAO_RESOLVIDO')).toBeUndefined();
  });

  it('escolhe Fiscal padrão = militar de menor ANT (BARCELLOS, ANT 418)', async () => {
    const r = await previa.getPreviaDoDia('2026-04-23');
    expect(r.fiscal).not.toBeNull();
    expect(r.fiscal!.origem).toBe('default');
    expect(r.fiscal!.militarNf).toBe('3037509');
    expect(r.fiscal!.militarResolvido?.nomeGuerra).toBe('BARCELLOS');
  });

  it('marca isFiscal=true na linha do Fiscal escolhido', async () => {
    const r = await previa.getPreviaDoDia('2026-04-23');
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
    const r = await previa.getPreviaDoDia('2026-04-23');
    expect(r.fiscal!.origem).toBe('cadastrado');
    expect(r.fiscal!.militarNf).toBe('3174824');
    expect(r.fiscal!.motivo).toBe('BARCELLOS em curso');
  });

  it('inclui IDEO de ABTS e RESGATE para o dia 23', async () => {
    const r = await previa.getPreviaDoDia('2026-04-23');
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
    previa = new PreviaService(
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
    );
    const r = await previa.getPreviaDoDia('2026-04-23');
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
    const r = await previa.getPreviaDoDia('2026-04-23');
    expect(r.tripulacao).toHaveLength(5);
    // Nenhuma equipe AQUATICAS ou STAFF aparece (vinha só do complemento MF):
    expect(r.tripulacao.filter((t) => t.equipe === 'AQUATICAS')).toEqual([]);
    expect(r.tripulacao.filter((t) => t.equipe === 'STAFF')).toEqual([]);
  });
});

describe('PreviaService — inconsistências', () => {
  let escalas: EscalasService;
  let fiscais: FiscaisService;
  let ideo: IdeoService;
  let efetivo: FakeEfetivoService;
  let viaturas: FakeViaturasService;
  let previa: PreviaService;

  beforeEach(() => {
    escalas = new EscalasService();
    fiscais = new FiscaisService();
    ideo = new IdeoService();
    efetivo = new FakeEfetivoService(EFETIVO_CHARLIE);
    viaturas = new FakeViaturasService([fakeViatura('ABTS 01')]);
    previa = new PreviaService(
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
    );
  });

  it('SEM_ESCALA_NO_MES quando mês não foi importado', async () => {
    const r = await previa.getPreviaDoDia('2026-07-15');
    expect(r.tripulacao).toEqual([]);
    expect(r.fiscal).toBeNull();
    expect(r.inconsistencias.some((i) => i.tipo === 'SEM_ESCALA_NO_MES')).toBe(true);
  });

  // S6g (2026-05-10) — Cenário do screenshot do Tech Lead: 10/05/2026 sem XLSX,
  // antes do fix apareciam AU_154/AC_001/AM_002 com militares vindos do MF.
  // Após o fix, Tripulação deve ficar vazia. Recursos do MF não complementam mais.
  it('S6g — sem XLSX, Tripulação fica vazia mesmo se houvesse recursos AQUATICAS/STAFF no MF', async () => {
    // Não chama escalas.save — mês 2026-07 não existe no storage
    const r = await previa.getPreviaDoDia('2026-07-15');
    expect(r.tripulacao).toEqual([]);
    expect(r.tripulacao.filter((t) => t.equipe === 'AQUATICAS')).toEqual([]);
    expect(r.tripulacao.filter((t) => t.equipe === 'STAFF')).toEqual([]);
  });

  it('EQUIPE_NAO_ESCALADA_NO_DIA quando mês existe mas dia sem equipe', async () => {
    escalas.save({
      ...escalaAbril2026,
      diaEquipe: { '2026-04-23': 'C' }, // só dia 23
    });
    const r = await previa.getPreviaDoDia('2026-04-22');
    expect(r.equipe).toBeNull();
    expect(r.inconsistencias.some((i) => i.tipo === 'EQUIPE_NAO_ESCALADA_NO_DIA')).toBe(true);
  });

  it('NF_NAO_RESOLVIDO quando militar do XLSX não está no QDI', async () => {
    escalas.save({
      ...escalaAbril2026,
      composicao: [
        {
          equipe: 'C',
          viatura: 'ABTS 01',
          funcao: 'Op 2',
          militar: { raw: 'SD INEXISTENTE', postoAbreviado: 'SD', nomeGuerra: 'INEXISTENTE' },
        },
      ],
    });
    const r = await previa.getPreviaDoDia('2026-04-23');
    expect(r.tripulacao[0]!.militarResolvido).toBeNull();
    expect(r.inconsistencias.some((i) => i.tipo === 'NF_NAO_RESOLVIDO')).toBe(true);
  });

  it('IDEO_NAO_CADASTRADO quando dia não tem IDEO', async () => {
    escalas.save(escalaAbril2026);
    const r = await previa.getPreviaDoDia('2026-04-23');
    const ideoMissing = r.inconsistencias.filter((i) => i.tipo === 'IDEO_NAO_CADASTRADO');
    // ABTS + RESGATE não cadastrados
    expect(ideoMissing.length).toBe(2);
  });

  it('VIATURA_DESCONHECIDA quando composição usa viatura não cadastrada', async () => {
    escalas.save({
      ...escalaAbril2026,
      composicao: [
        {
          equipe: 'C',
          viatura: 'ABTS 99',
          funcao: 'Ch',
          militar: { raw: '2º SGT BARCELLOS', postoAbreviado: '2ºSGT', nomeGuerra: 'BARCELLOS' },
        },
      ],
    });
    const r = await previa.getPreviaDoDia('2026-04-23');
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
    const r = await previa.getPreviaDoDia('2026-04-23');
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
