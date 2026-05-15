import bcrypt from 'bcryptjs';
import type { Papel } from '@argus/shared-types';

/**
 * Usuários mock para Sprint S1 — substituídos por dados reais do Supabase em S5.
 *
 * NFs são reais (extraídos do CSV público do Sargenteante em 2026-05-08).
 * A senha inicial é "batalhao01" para todos (decisão Tech Lead 2026-05-15);
 * `primeiroAcesso=true` obriga troca via /trocar-senha no primeiro login.
 *
 * `cpfFake` é mantido como campo do tipo apenas para compat com testes
 * existentes que referenciam `MOCK_USERS[i].cpfFake` como senha — ele
 * agora carrega o mesmo valor de `DEFAULT_SENHA`.
 */
export interface MockUser {
  nf: string;
  nome: string;
  posto: string;
  ant: number;
  /** Senha do primeiro acesso. Para todos: "batalhao01". */
  cpfFake: string;
  senhaHash: string;
  papeis: Papel[];
  primeiroAcesso: boolean;
}

const COST = 12;
const DEFAULT_SENHA = 'batalhao01';
const DEFAULT_HASH = bcrypt.hashSync(DEFAULT_SENHA, COST);

export const MOCK_USERS: MockUser[] = [
  {
    nf: '3037509',
    nome: 'HEITOR BARCELLOS COELHO',
    posto: '2ºSGT',
    ant: 419,
    cpfFake: DEFAULT_SENHA,
    senhaHash: DEFAULT_HASH,
    papeis: ['admin', 'fiscal'],
    primeiroAcesso: true,
  },
  {
    // Sargenteante real da 1ª Cia/1º BBM (corrigido em S2.5).
    // S1 inicial usou NF 903581 (ANDERSON MATTOS SIMOES) que pertence à SAT, não à 1ª Cia.
    // Fonte: QDI seção "1ªCIA/1ºBBM" → função "Sargenteante" → nome de guerra "D. MATTOS".
    nf: '2982390',
    nome: 'DANIEL DE AMORIM MATTOS',
    posto: '2ºSGT',
    ant: 366,
    cpfFake: DEFAULT_SENHA,
    senhaHash: DEFAULT_HASH,
    papeis: ['sargenteante'],
    primeiroAcesso: true,
  },
  {
    nf: '4750713',
    nome: 'CAUE LYRA CASTRO',
    posto: 'SD',
    ant: 1164,
    cpfFake: DEFAULT_SENHA,
    senhaHash: DEFAULT_HASH,
    papeis: ['dro', 'sentinela', 'militar'],
    primeiroAcesso: true,
  },
  {
    nf: '3670180',
    nome: 'DANILO VICENTE COELHO DA SILVA',
    posto: 'CB',
    ant: 891,
    cpfFake: DEFAULT_SENHA,
    senhaHash: DEFAULT_HASH,
    papeis: ['cov', 'motorista'],
    primeiroAcesso: true,
  },
  {
    nf: '4750241',
    nome: 'FERNANDA FONSECA MARTINELLI',
    posto: 'SD',
    ant: 1096,
    cpfFake: DEFAULT_SENHA,
    senhaHash: DEFAULT_HASH,
    papeis: ['operador', 'socorrista'],
    primeiroAcesso: true,
  },
  {
    nf: '3022269',
    nome: 'BRUNO MELO',
    posto: '3ºSGT',
    ant: 650,
    cpfFake: DEFAULT_SENHA,
    senhaHash: DEFAULT_HASH,
    papeis: ['chefe_equipe', 'fiscal'],
    primeiroAcesso: true,
  },
  {
    nf: '2984946',
    nome: 'MARIANE GUARNIER BRUMATTI',
    posto: '2ºSGT',
    ant: 250,
    cpfFake: DEFAULT_SENHA,
    senhaHash: DEFAULT_HASH,
    papeis: ['fiscal'],
    primeiroAcesso: true,
  },
  {
    nf: '3037770',
    nome: 'JEZREEL',
    posto: 'SGT',
    ant: 420,
    cpfFake: DEFAULT_SENHA,
    senhaHash: DEFAULT_HASH,
    papeis: ['motorista', 'almoxarife'],
    primeiroAcesso: true,
  },
];

export function findMockUserByNf(nf: string): MockUser | undefined {
  return MOCK_USERS.find((u) => u.nf === nf);
}
