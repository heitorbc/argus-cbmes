import { describe, it, expect, beforeEach } from 'vitest';
import type { MapaForcaDoDia } from '@argus/shared-types';
import { ParteDiariaService } from './parte-diaria.service';
import type { PreviaService } from '../mapa-forca/mapa-forca.service';

/**
 * S10 — Tests do ParteDiariaService.
 *
 * Mocka `PreviaService.getMapaForcaDoDia` para isolar a lógica de composição
 * + override sem precisar do setup pesado da Prévia (escala, MF, efetivo).
 */
function fakePrevia(overrides: Partial<MapaForcaDoDia> = {}): MapaForcaDoDia {
  return {
    data: '2026-05-04',
    ano: 2026,
    mes: 5,
    dia: 4,
    equipe: 'B',
    equipeNome: 'BRAVO',
    fiscal: {
      militarNf: '2984946',
      militarResolvido: {
        nf: '2984946',
        ant: 250,
        posto: '2ºSGT',
        nome: 'MARIANE GUARNIER BRUMATTI',
        nomeGuerra: 'MARIANE',
        subSecao: 'sos',
      },
      origem: 'default',
    },
    composicaoMf: [
      {
        recurso: 'AU 154',
        vtrPrefixo: 'AU 154',
        vtrStatus: 'operacional',
        semEquipe: false,
        equipe: 'B',
        chefe: {
          raw: 'CAP QOA BAUSSEN',
          postoAbreviado: 'CAP',
          nomeGuerra: 'BAUSSEN',
          militarResolvido: null,
          statusConferencia: 'pendente',
          isFiscal: false,
        },
        motorista: {
          raw: '2º SGT MARIANE',
          postoAbreviado: '2ºSGT',
          nomeGuerra: 'MARIANE',
          militarResolvido: null,
          statusConferencia: 'pendente',
          isFiscal: true,
        },
        operadores: [],
      },
      {
        recurso: 'ABTS 011',
        vtrPrefixo: 'ABTS 011',
        vtrStatus: 'operacional',
        semEquipe: false,
        equipe: 'B',
        chefe: {
          raw: '2º SGT JARDEL',
          postoAbreviado: '2ºSGT',
          nomeGuerra: 'JARDEL',
          militarResolvido: null,
          statusConferencia: 'pendente',
          isFiscal: false,
        },
        motorista: undefined,
        operadores: [
          {
            raw: 'CB ANDRÉ LUIS',
            postoAbreviado: 'CB',
            nomeGuerra: 'ANDRÉ LUIS',
            militarResolvido: null,
            statusConferencia: 'pendente',
            isFiscal: false,
          },
        ],
      },
    ],
    tripulacao: [],
    ideo: [],
    ideoStatus: [],
    textoAtestadoIdeoFiscal: null,
    viaturasOperacionais: [],
    inconsistencias: [],
    trocas: [],
    escalaEspecial: {},
    notasServico: [],
    dispensas: [],
    atestados: [],
    escalaEspecialAtos: [],
    trocasEscalaEspecial: [],
    chefesOperacoes: [],
    estadoServico: 'NAO_INICIADO',
    alteracoesDiversas: [],
    origemEscala: '05 MAIO DE 2026.xlsx',
    geradoEm: '2026-05-04T07:00:00.000Z',
    ...overrides,
  };
}

class FakePreviaService {
  payload: MapaForcaDoDia = fakePrevia();
  async getMapaForcaDoDia(): Promise<MapaForcaDoDia> {
    return this.payload;
  }
}

class FakeMateriaisService {
  pendencias: Array<{ vtrPrefixo: string; label: string; status: string; observacao?: string }> =
    [];
  listarPendenciasDoDia(): Array<{
    vtrPrefixo: string;
    label: string;
    status: string;
    observacao?: string;
  }> {
    return this.pendencias;
  }
}

describe('ParteDiariaService (S10)', () => {
  let prevSvc: FakePreviaService;
  let matSvc: FakeMateriaisService;
  let svc: ParteDiariaService;

  beforeEach(() => {
    prevSvc = new FakePreviaService();
    matSvc = new FakeMateriaisService();
    svc = new ParteDiariaService(prevSvc as unknown as PreviaService, matSvc as unknown as never);
  });

  it('rascunho deriva equipe + Fiscal que assume + dia seguinte', async () => {
    const pd = await svc.get('2026-05-04');
    expect(pd.data).toBe('2026-05-04');
    expect(pd.proximoDia).toBe('2026-05-05');
    expect(pd.equipe).toBe('B');
    expect(pd.equipeNome).toBe('BRAVO');
    expect(pd.fiscalQueAssume?.nf).toBe('2984946');
    expect(pd.fiscalQuePassa).toBeNull();
    expect(pd.textoAssuncao).toMatch(/MARIANE GUARNIER BRUMATTI/);
  });

  it('troca_militar inclui horário "Às HHhMMmin," no texto de Alterações (S6n/0.2)', async () => {
    prevSvc.payload = fakePrevia({
      alteracoesDiversas: [
        {
          id: 'alt:troca:1',
          data: '2026-05-04',
          tipo: 'troca_militar',
          recurso: 'ABTS_01',
          funcao: 'Mot',
          militarOriginalRaw: 'CB ASSIS',
          militarOriginalNf: '3371760',
          militarSubstitutoRaw: 'CB FABRE',
          militarSubstitutoNf: '3055566',
          motivo: 'mal-estar',
          registradoPorNf: '2984946',
          registradoEm: '2026-05-04T14:30:00.000Z',
        },
      ],
    });
    const pd = await svc.get('2026-05-04');
    expect(pd.textoAlteracoesDiversas).toMatch(/Às 14h30min/);
    expect(pd.textoAlteracoesDiversas).toMatch(/troca de militar no ABTS_01\/Mot/);
    expect(pd.textoAlteracoesDiversas).toMatch(/CB FABRE.*substituiu.*CB ASSIS/);
    expect(pd.textoAlteracoesDiversas).toMatch(/mal-estar/);
  });

  it('1-militar (só motorista) vira "Chefe/Motorista" na PD (S6n/0.6)', async () => {
    prevSvc.payload = fakePrevia({
      composicaoMf: [
        {
          recurso: 'ATB',
          vtrPrefixo: 'ATB 001',
          vtrStatus: 'DISPONIVEL',
          semEquipe: false,
          equipe: 'B',
          chefe: undefined,
          motorista: {
            raw: 'CB ANDRÉ LUIS',
            postoAbreviado: 'CB',
            nomeGuerra: 'ANDRÉ LUIS',
            militarResolvido: null,
            statusConferencia: 'pendente',
            isFiscal: false,
          },
          operadores: [],
        },
      ],
    });
    const pd = await svc.get('2026-05-04');
    const atb = pd.escalasOperacionais.find((e) => e.recurso === 'ATB')!;
    expect(atb.militares).toHaveLength(1);
    expect(atb.militares[0]!.funcao).toBe('Chefe/Motorista');
    expect(atb.militares[0]!.militarRaw).toBe('CB ANDRÉ LUIS');
  });

  it('1-militar (só chefe) também vira "Chefe/Motorista"', async () => {
    prevSvc.payload = fakePrevia({
      composicaoMf: [
        {
          recurso: 'AC 001',
          vtrPrefixo: 'AC 001',
          vtrStatus: 'DISPONIVEL',
          semEquipe: false,
          equipe: 'B',
          chefe: {
            raw: '3º SGT DAN',
            postoAbreviado: '3ºSGT',
            nomeGuerra: 'DAN',
            militarResolvido: null,
            statusConferencia: 'pendente',
            isFiscal: false,
          },
          motorista: undefined,
          operadores: [],
        },
      ],
    });
    const pd = await svc.get('2026-05-04');
    const ac = pd.escalasOperacionais.find((e) => e.recurso === 'AC 001')!;
    expect(ac.militares).toHaveLength(1);
    expect(ac.militares[0]!.funcao).toBe('Chefe/Motorista');
  });

  it('escalas operacionais espelham composicaoMf com chefe/motorista/operadores ordenados', async () => {
    const pd = await svc.get('2026-05-04');
    expect(pd.escalasOperacionais).toHaveLength(2);
    const au = pd.escalasOperacionais.find((e) => e.recurso === 'AU 154')!;
    expect(au.militares.map((m) => m.funcao)).toEqual(['Chefe', 'Motorista']);
    const abts = pd.escalasOperacionais.find((e) => e.recurso === 'ABTS 011')!;
    expect(abts.militares.map((m) => m.funcao)).toEqual(['Chefe', 'Operador 1']);
  });

  it('texto de Trocas vem em formato numerado quando há trocas pré-turno', async () => {
    prevSvc.payload = fakePrevia({
      trocas: [
        {
          substituidoRaw: 'CB BM ASSIS',
          substituidoNf: '3371760',
          substitutoRaw: 'CB BM FABRE',
          substitutoNf: '3055566',
          periodo: { tipo: 'custom', horaInicio: '07:10', horaFim: '13:10' },
          motivo: 'Substituição na sentinela',
        },
      ],
    });
    const pd = await svc.get('2026-05-04');
    expect(pd.textoTrocas).toMatch(/^1\. /);
    expect(pd.textoTrocas).toMatch(/FABRE.*substituiu.*ASSIS/);
    expect(pd.textoTrocas).toMatch(/das 07:10 às 13:10/);
  });

  it('texto IDEO Fiscal usa string da Prévia quando disponível, senão pendente', async () => {
    prevSvc.payload = fakePrevia({
      textoAtestadoIdeoFiscal: 'Eu, 2º SGT MARIANE, NF 2984946, atesto...',
    });
    let pd = await svc.get('2026-05-04');
    expect(pd.textoIdeoFiscal).toMatch(/^Eu, 2º SGT MARIANE/);

    prevSvc.payload = fakePrevia({ textoAtestadoIdeoFiscal: null });
    pd = await svc.get('2026-05-04');
    expect(pd.textoIdeoFiscal).toMatch(/Pendente/);
  });

  it('alterações diversas agregam dispensas + atestados + alteracoes', async () => {
    prevSvc.payload = fakePrevia({
      dispensas: [
        {
          militarRaw: 'CB BM CUPERTINO',
          militarNf: '3427609',
          tipo: 'V_ANIVERSARIO',
          tipoLabel: 'Aniversário',
          dataInicio: '2026-05-04',
          dias: 1,
        },
      ],
      atestados: [
        {
          atestadoId: 'at:1',
          militarNf: '3669777',
          militarRaw: 'CB BM BEATRIZ',
          dataInicio: '2026-05-03',
          dias: 5,
          cid10: 'J00',
          crmMedico: 'CRM-ES 12345',
        },
      ],
      alteracoesDiversas: [
        {
          id: 'alt:1',
          data: '2026-05-04',
          tipo: 'observacao',
          observacao: 'Mangueira de 38mm não encontrada no ATB 001.',
          registradoPorNf: '2984946',
          registradoEm: '2026-05-04T10:00:00.000Z',
        },
      ],
    });
    const pd = await svc.get('2026-05-04');
    expect(pd.textoAlteracoesDiversas).toMatch(/CUPERTINO.*Aniversário/);
    expect(pd.textoAlteracoesDiversas).toMatch(/BEATRIZ.*atestado.*J00/);
    expect(pd.textoAlteracoesDiversas).toMatch(/Mangueira de 38mm/);
  });

  it('salvar override + get aplica override por cima do rascunho', async () => {
    const pd = await svc.salvar(
      '2026-05-04',
      {
        textoInstrucao: 'Instrução de salvamento aquático ministrada às 14h.',
        textoAlteracaoViaturas: 'ATB 001 com vazamento no compartimento 3.',
        kmInicialPorRecurso: { 'AU 154': 29345 },
        fiscalQuePassa: {
          posto: '2ºSGT',
          nome: 'JÚLIO CESAR NOYA LOPES',
          nomeGuerra: 'JÚLIO',
          nf: '1234567',
        },
      },
      '2984946',
    );

    expect(pd.textoInstrucao).toBe('Instrução de salvamento aquático ministrada às 14h.');
    expect(pd.textoAlteracaoViaturas).toMatch(/ATB 001/);
    expect(pd.escalasOperacionais.find((e) => e.recurso === 'AU 154')?.kmInicial).toBe(29345);
    expect(pd.fiscalQuePassa?.nome).toBe('JÚLIO CESAR NOYA LOPES');
    expect(pd.textoAssuncao).toMatch(/em substituição ao 2ºSGT JÚLIO CESAR NOYA LOPES/);
    expect(pd.ultimoEditorNf).toBe('2984946');
    expect(pd.ultimaEdicaoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('textoAlteracaoAlmoxarifado é derivado das pendências de Materiais (S8)', async () => {
    matSvc.pendencias = [
      {
        vtrPrefixo: 'ABTS 011',
        label: 'Mangueira de 38mm × 2',
        status: 'AUSENTE',
        observacao: 'Faltou 1 unidade',
      },
      { vtrPrefixo: 'AR 044', label: 'Maca rígida', status: 'DANIFICADO' },
    ];
    const pd = await svc.get('2026-05-04');
    expect(pd.textoAlteracaoAlmoxarifado).toMatch(/1\. ABTS 011.*Mangueira.*Faltando.*Faltou 1/);
    expect(pd.textoAlteracaoAlmoxarifado).toMatch(/2\. AR 044.*Maca rígida.*Danificado/);
  });

  it('textoAlteracaoAlmoxarifado fica "Não houve." sem pendências de Materiais', async () => {
    matSvc.pendencias = [];
    const pd = await svc.get('2026-05-04');
    expect(pd.textoAlteracaoAlmoxarifado).toBe('Não houve.');
  });

  it('finalizar() seta lock; salvar() depois lança ConflictException', async () => {
    const finalizada = await svc.finalizar('2026-05-04', '2984946');
    expect(finalizada.finalizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(finalizada.finalizadoPorNf).toBe('2984946');

    await expect(svc.salvar('2026-05-04', { textoInstrucao: 'X' }, '2984946')).rejects.toThrow(
      /finalizada/,
    );
  });

  it('reabrir() limpa o lock; edições voltam a funcionar', async () => {
    await svc.finalizar('2026-05-04', '2984946');
    const reaberta = await svc.reabrir('2026-05-04');
    expect(reaberta.finalizadoEm).toBeNull();
    expect(reaberta.finalizadoPorNf).toBeNull();

    const pd = await svc.salvar('2026-05-04', { textoInstrucao: 'Pós-reabertura' }, '2984946');
    expect(pd.textoInstrucao).toBe('Pós-reabertura');
  });

  it('reset() limpa overrides — get volta ao rascunho original', async () => {
    await svc.salvar('2026-05-04', { textoInstrucao: 'X' }, '2984946');
    expect((await svc.get('2026-05-04')).textoInstrucao).toBe('X');
    svc.reset();
    expect((await svc.get('2026-05-04')).textoInstrucao).toBe('Não houve.');
  });
});
