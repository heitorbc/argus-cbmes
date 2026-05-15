import { describe, it, expect } from 'vitest';
import type { MapaForcaDoDia, TripulacaoEntry } from '@argus/shared-types';
import { formatPreviaParaWhatsapp } from './whatsapp';

function tripulacao(
  equipe: 'A' | 'B' | 'C' | 'D' | 'AQUATICAS' | 'STAFF',
  viatura: string,
  funcao: string,
  posto: string,
  nomeGuerra: string,
): TripulacaoEntry {
  return {
    equipe,
    viatura,
    funcao,
    militarRef: { raw: `${posto} ${nomeGuerra}`, postoAbreviado: posto, nomeGuerra },
    militarResolvido: {
      nf: '1',
      ant: 1,
      posto,
      nome: nomeGuerra,
      nomeGuerra,
    },
    isFiscal: false,
  };
}

const previaCharlie: MapaForcaDoDia = {
  data: '2026-04-19',
  ano: 2026,
  mes: 4,
  dia: 19,
  equipe: 'C',
  equipeNome: 'CHARLIE',
  fiscal: null,
  tripulacao: [
    tripulacao('STAFF', 'AU 154', 'Ch', '1ºTEN QOA', 'BOREL'),
    tripulacao('STAFF', 'AU 154', 'Mot', 'CB', 'BERGI'),
    tripulacao('C', 'ABTS 011', 'Ch', '2ºSGT', 'BARCELLOS'),
    tripulacao('C', 'ABTS 011', 'Mot', 'CB', 'VICENTE'),
    tripulacao('C', 'ABTS 011', 'Op1', 'SD', 'MARTINELLI'),
    tripulacao('C', 'AR 044', 'Ch', '3ºSGT', 'KARINA'),
    tripulacao('C', 'AR 044', 'Mot', 'CB', 'FABRE'),
    tripulacao('C', 'AR 044', 'Soc', 'CB', 'MELLINA'),
    tripulacao('C', 'GUARDA', 'Sent. 1', 'CB', 'ESMAEL'),
    tripulacao('C', 'GUARDA', 'Sent. 2', 'SD', 'LOUREIRO'),
    tripulacao('C', 'GUARDA', 'Sent. 3', 'SD', 'DANILO'),
    tripulacao('AQUATICAS', 'AM_002', 'Ch', '3ºSGT', 'HUMBERTO'),
    tripulacao('AQUATICAS', 'AM_002', 'Mot', 'CB', 'BEATRIZ'),
    tripulacao('AQUATICAS', 'AM_002', 'M1', 'CB', 'VINICIUS'),
  ],
  ideo: [
    { tipo: 'ABTS', itens: ['Mochila Costal', 'GPS'] },
    { tipo: 'RESGATE', itens: ['Oxigênio', 'Aspirador'] },
  ],
  viaturasOperacionais: [
    { id: 'au', codigo: 'AU 154', descricao: 'CHEFE DE OPERAÇÕES', vtrStatus: 'operacional' },
    { id: 'abts', codigo: 'ABTS 011', descricao: 'ABTS_01', vtrStatus: 'operacional' },
    { id: 'ar', codigo: 'AR 044', descricao: 'RESGATE 01', vtrStatus: 'operacional' },
    { id: 'te', codigo: 'TE 110', descricao: 'PLATAFORMA', vtrStatus: 'baixada' },
    { id: 'am', codigo: 'AM_002', descricao: 'MERGULHO 02', vtrStatus: 'operacional' },
  ],
  inconsistencias: [],
  trocas: [
    {
      substituidoRaw: 'CB GUILHERME PERIM',
      substitutoRaw: 'CB FABRE',
      periodo: '24h',
    },
  ],
  escalaEspecial: {
    matutina: { militarRaw: 'SGT BRUNO MELO' },
    vespertina: { militarRaw: 'CB ELSON' },
  },
  notasServico: [{ codigo: 'NS072', descricao: 'PB RESGATE DIAS 23/04 E 24/04' }],
  dispensas: [{ militarRaw: '2° SGT HOFFMAM' }],
  escalaEspecialAtos: [],
  trocasEscalaEspecial: [],
  swapsMilitares: [],
  overridesMergulho: [],
  overridesParesRecursos: [],
  ativacoesRecurso: [],
  overridesChefeOperacoes: [],
  composicaoAtualMf: [],
  ferias: [],
  chefesOperacoes: [],
  composicaoMf: [],
  estadoServico: 'NAO_INICIADO',
  alteracoesDiversas: [],
  ideoStatus: [],
  textoAtestadoIdeoFiscal: null,
  atestados: [],
  origemEscala: '04 ABRIL DE 2026.xlsx',
  geradoEm: '2026-05-09T00:00:00.000Z',
};

describe('formatPreviaParaWhatsapp (S5/F7d)', () => {
  it('gera o formato esperado pelo Fiscal (sample 19/04/2026 CHARLIE)', () => {
    const out = formatPreviaParaWhatsapp(previaCharlie);
    // Cabeçalho
    expect(out).toContain('*PRÉVIA MAPA FORÇA*');
    expect(out).toContain('*EQUIPE CHARLIE*');
    expect(out).toContain('19/04/2026');
    // Seção 1: viaturas
    expect(out).toContain('1. VIATURAS');
    expect(out).toContain('🛻⭐ *CHEFE DE OPERAÇÕES - AU 154*');
    expect(out).toContain('🚒 *ABTS_01 - ABTS 011*');
    expect(out).toContain('🚑 *RESGATE 01 - AR 044*');
    // Mergulho com funções M1
    expect(out).toContain('🤿👨‍🚒 *MERGULHO 02 - AM_002*');
    expect(out).toMatch(/M1: CB VINICIUS/);
    // 3 sentinelas distintas
    expect(out).toContain('Sent. 1: CB ESMAEL');
    expect(out).toContain('Sent. 2: SD LOUREIRO');
    expect(out).toContain('Sent. 3: SD DANILO');
    // Demais seções
    expect(out).toContain('2. TROCAS:');
    expect(out).toContain('SUBSTITUÍDO: CB GUILHERME PERIM');
    expect(out).toContain('SUBSTITUTO: CB FABRE');
    expect(out).toContain('PERÍODO: 24h');
    expect(out).toContain('3. ESCALA ESPECIAL:');
    expect(out).toContain('Matutina: SGT BRUNO MELO');
    expect(out).toContain('Vespertina: CB ELSON');
    expect(out).toContain('4. NOTAS DE SERVIÇO');
    expect(out).toContain('NS072 - PB RESGATE DIAS 23/04 E 24/04');
    expect(out).toContain('5. DISPENSA:');
    expect(out).toContain('2° SGT HOFFMAM');
    expect(out).toContain('6. IDEO:');
    expect(out).toContain('6.1 ABTS');
    expect(out).toContain('Mochila Costal');
    expect(out).toContain('6.2 RESGATE');
    expect(out).toContain('Oxigênio');
  });

  it('mostra status inline (#BAIXADA#) quando vtr não é operacional', () => {
    const previa: MapaForcaDoDia = {
      ...previaCharlie,
      tripulacao: [tripulacao('C', 'TE 110', 'Ch/Mot', 'CB', 'DENIS')],
    };
    const out = formatPreviaParaWhatsapp(previa);
    expect(out).toMatch(/PLATAFORMA - TE 110\* \*\*\*#BAIXADA#\*\*\*/);
  });

  it('lida com Prévia sem equipe escalada', () => {
    const previa: MapaForcaDoDia = {
      ...previaCharlie,
      equipe: null,
      equipeNome: null,
      tripulacao: [],
    };
    const out = formatPreviaParaWhatsapp(previa);
    expect(out).toContain('*SEM EQUIPE ESCALADA*');
  });

  it('seções vazias têm placeholder explícito', () => {
    const previa: MapaForcaDoDia = {
      ...previaCharlie,
      trocas: [],
      escalaEspecial: {},
      notasServico: [],
      dispensas: [],
    };
    const out = formatPreviaParaWhatsapp(previa);
    expect(out).toContain('Sem trocas.');
    expect(out).toContain('Sem escala especial.');
    expect(out).toContain('Sem NS aplicáveis.');
    expect(out).toContain('Sem dispensas.');
  });
});
