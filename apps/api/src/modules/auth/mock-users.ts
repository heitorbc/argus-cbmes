import bcrypt from 'bcryptjs';
import type { Papel } from '@argus/shared-types';

/**
 * Usuários mock para Sprint S1 — substituídos por dados reais do Supabase em S5.
 *
 * NFs são reais (extraídos do CSV público do Sargenteante em 2026-05-08).
 * CPFs ("senha inicial") são FAKE — gerados para teste, formato válido (11 dígitos),
 * NÃO correspondem a pessoas reais. Conformidade LGPD (PRD §7.2).
 *
 * Cada usuário tem `senhaHash` (bcrypt cost 12) e `primeiroAcesso=true`. No primeiro login,
 * o sistema obriga troca via /trocar-senha.
 */
export interface MockUser {
  nf: string;
  nome: string;
  posto: string;
  ant: number;
  cpfFake: string; // só para o seed; NÃO exposto em runtime
  senhaHash: string;
  papeis: Papel[];
  primeiroAcesso: boolean;
}

// Bcrypt hashes pré-computados (cost 12) para cada CPF fake.
// Gerados deterministicamente na carga; não são senhas reais de ninguém.
// Para testar localmente: usar `cpfFake` como senha em /auth/login.
const FAKE_CPFS = {
  HEITOR: '11122233344',
  MATTOS: '22233344455',
  LYRA: '33344455566',
  VICENTE: '44455566677',
  MARTINELLI: '55566677788',
} as const;

const COST = 12;

export const MOCK_USERS: MockUser[] = [
  {
    nf: '3037509',
    nome: 'HEITOR BARCELLOS COELHO',
    posto: '2ºSGT',
    ant: 419,
    cpfFake: FAKE_CPFS.HEITOR,
    senhaHash: bcrypt.hashSync(FAKE_CPFS.HEITOR, COST),
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
    cpfFake: FAKE_CPFS.MATTOS,
    senhaHash: bcrypt.hashSync(FAKE_CPFS.MATTOS, COST),
    papeis: ['sargenteante'],
    primeiroAcesso: true,
  },
  {
    nf: '4750713',
    nome: 'CAUE LYRA CASTRO',
    posto: 'SD',
    ant: 1164,
    cpfFake: FAKE_CPFS.LYRA,
    senhaHash: bcrypt.hashSync(FAKE_CPFS.LYRA, COST),
    papeis: ['dro', 'sentinela', 'militar'],
    primeiroAcesso: true,
  },
  {
    nf: '3670180',
    nome: 'DANILO VICENTE COELHO DA SILVA',
    posto: 'CB',
    ant: 891,
    cpfFake: FAKE_CPFS.VICENTE,
    senhaHash: bcrypt.hashSync(FAKE_CPFS.VICENTE, COST),
    papeis: ['cov', 'motorista'],
    primeiroAcesso: true,
  },
  {
    nf: '4750241',
    nome: 'FERNANDA FONSECA MARTINELLI',
    posto: 'SD',
    ant: 1096,
    cpfFake: FAKE_CPFS.MARTINELLI,
    senhaHash: bcrypt.hashSync(FAKE_CPFS.MARTINELLI, COST),
    papeis: ['operador', 'socorrista'],
    primeiroAcesso: true,
  },
];

export function findMockUserByNf(nf: string): MockUser | undefined {
  return MOCK_USERS.find((u) => u.nf === nf);
}
