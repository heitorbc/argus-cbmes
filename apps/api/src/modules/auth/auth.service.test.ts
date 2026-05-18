import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, HttpException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { LoginRateLimiter } from './login-rate-limiter';
import { MOCK_USERS } from './mock-users';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Mock in-memory do `PrismaService` — implementa apenas os métodos de
 * `user` usados pelo AuthService. Suficiente pra rodar todos os asserts
 * sem precisar de Postgres real no test runner.
 */
function makePrismaMock(seed: User[]): PrismaService {
  const store = new Map<string, User>(seed.map((u) => [u.nf, { ...u }]));
  const userModel = {
    findFirst: async ({ where }: { where: { nf: string; deletedAt: null } }) => {
      const u = store.get(where.nf);
      if (!u || u.deletedAt) return null;
      return u;
    },
    findUnique: async ({ where }: { where: { nf?: string; email?: string } }) => {
      if (where.nf) return store.get(where.nf) ?? null;
      if (where.email) {
        for (const u of store.values()) if (u.email === where.email) return u;
      }
      return null;
    },
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: { deletedAt: null };
      orderBy?: { nome: 'asc' };
    }) => {
      let arr = [...store.values()];
      if (where) arr = arr.filter((u) => !u.deletedAt);
      if (orderBy?.nome === 'asc') arr.sort((a, b) => a.nome.localeCompare(b.nome));
      return arr;
    },
    update: async ({ where, data }: { where: { nf: string }; data: Partial<User> }) => {
      const u = store.get(where.nf);
      if (!u) throw new Error(`No user ${where.nf}`);
      const next = { ...u, ...data, atualizadoEm: new Date() } as User;
      store.set(where.nf, next);
      return next;
    },
    create: async ({ data }: { data: Omit<User, 'id' | 'criadoEm' | 'atualizadoEm'> }) => {
      const now = new Date();
      const next: User = {
        id: `cuid-${data.nf}`,
        ultimoLoginEm: null,
        criadoEm: now,
        atualizadoEm: now,
        ...data,
      } as User;
      store.set(next.nf, next);
      return next;
    },
  };
  return { user: userModel } as unknown as PrismaService;
}

async function seedUsers(): Promise<User[]> {
  const hash = await bcrypt.hash('batalhao01', 4);
  return MOCK_USERS.map((u) => ({
    id: `cuid-${u.nf}`,
    nf: u.nf,
    nome: u.nome,
    nomeGuerra: null,
    posto: u.posto,
    ant: u.ant,
    papeis: u.papeis,
    senhaHash: hash,
    primeiroAcesso: true,
    email: null,
    ultimoLoginEm: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    deletedAt: null,
  }));
}

async function makeService(): Promise<AuthService> {
  const config = {
    get: (key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret-with-enough-bytes-for-hs256-please';
      if (key === 'BCRYPT_COST') return '4'; // fast for tests
      return undefined;
    },
    getOrThrow: (key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret-with-enough-bytes-for-hs256-please';
      throw new Error(`Missing ${key}`);
    },
  } as unknown as ConfigService;

  const jwt = new JwtService({ secret: 'test-secret-with-enough-bytes-for-hs256-please' });
  const prisma = makePrismaMock(await seedUsers());
  // Mock minimal do EfetivoService — auto-provision tests configuram override.
  const efetivo = {
    findByNf: async (_nf: string) => null,
  } as unknown as import('../efetivo/efetivo.service').EfetivoService;
  return new AuthService(prisma, jwt, config, new LoginRateLimiter(), efetivo);
}

const HEITOR = MOCK_USERS[0]!; // 3037509 — admin/fiscal
const SENHA_DEFAULT = 'batalhao01';

describe('AuthService.login', () => {
  let service: AuthService;
  beforeEach(async () => {
    service = await makeService();
  });

  it('autentica com NF e senha default corretos', async () => {
    const result = await service.login({ nf: HEITOR.nf, senha: SENHA_DEFAULT });
    expect(result.user.nf).toBe(HEITOR.nf);
    expect(result.user.nome).toBe(HEITOR.nome);
    expect(result.user.papeis).toContain('admin');
    expect(result.token).toBeDefined();
    expect(result.token.split('.').length).toBe(3);
  });

  it('retorna primeiroAcesso=true para usuário recém-cadastrado', async () => {
    const result = await service.login({ nf: HEITOR.nf, senha: SENHA_DEFAULT });
    expect(result.user.primeiroAcesso).toBe(true);
  });

  it('rejeita NF inexistente com 401', async () => {
    await expect(service.login({ nf: '9999999', senha: 'qualquer' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita senha incorreta com 401', async () => {
    await expect(service.login({ nf: HEITOR.nf, senha: 'errada' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('bloqueia (423) após 5 tentativas falhas', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(service.login({ nf: HEITOR.nf, senha: 'errada' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    await expect(service.login({ nf: HEITOR.nf, senha: SENHA_DEFAULT })).rejects.toThrow(
      HttpException,
    );
  });

  it('reseta contador de falhas após login bem-sucedido', async () => {
    for (let i = 0; i < 4; i++) {
      await expect(service.login({ nf: HEITOR.nf, senha: 'errada' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    await service.login({ nf: HEITOR.nf, senha: SENHA_DEFAULT });
    for (let i = 0; i < 4; i++) {
      await expect(service.login({ nf: HEITOR.nf, senha: 'errada' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });
});

describe('AuthService.changePassword', () => {
  let service: AuthService;
  beforeEach(async () => {
    service = await makeService();
  });

  it('troca senha com sucesso e marca primeiroAcesso=false', async () => {
    const updated = await service.changePassword(HEITOR.nf, {
      senhaAtual: SENHA_DEFAULT,
      novaSenha: 'NovaSenhaForte123!',
      confirmacao: 'NovaSenhaForte123!',
      // S2.10.4 — email obrigatório no 1º acesso
      email: 'heitor@cbmes.es.gov.br',
    });
    expect(updated.primeiroAcesso).toBe(false);
    expect(updated.email).toBe('heitor@cbmes.es.gov.br');

    const loginNovo = await service.login({ nf: HEITOR.nf, senha: 'NovaSenhaForte123!' });
    expect(loginNovo.user.nf).toBe(HEITOR.nf);
    expect(loginNovo.user.primeiroAcesso).toBe(false);

    await expect(service.login({ nf: HEITOR.nf, senha: SENHA_DEFAULT })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('S2.10.4 — rejeita troca de senha no 1º acesso sem email', async () => {
    await expect(
      service.changePassword(HEITOR.nf, {
        senhaAtual: SENHA_DEFAULT,
        novaSenha: 'NovaSenhaForte123!',
        confirmacao: 'NovaSenhaForte123!',
      }),
    ).rejects.toThrow(/E-mail é obrigatório/);
  });

  it('rejeita troca quando senhaAtual está incorreta', async () => {
    await expect(
      service.changePassword(HEITOR.nf, {
        senhaAtual: 'errada',
        novaSenha: 'NovaSenhaForte123',
        confirmacao: 'NovaSenhaForte123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.getCurrentUser', () => {
  it('retorna o usuário pelo NF', async () => {
    const service = await makeService();
    const user = await service.getCurrentUser(HEITOR.nf);
    expect(user.nome).toBe(HEITOR.nome);
    expect(user.posto).toBe(HEITOR.posto);
  });

  it('lança 401 para NF inexistente', async () => {
    const service = await makeService();
    await expect(service.getCurrentUser('9999999')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.loginAsPersona (persona-picker homologação)', () => {
  it('emite JWT válido + primeiroAcesso=false para persona existente', async () => {
    const service = await makeService();
    const result = await service.loginAsPersona(HEITOR.nf);
    expect(result.user.nf).toBe(HEITOR.nf);
    expect(result.user.papeis).toContain('admin');
    expect(result.user.primeiroAcesso).toBe(false);
    expect(result.token.split('.').length).toBe(3);
  });

  it('lança 401 para persona inexistente', async () => {
    const service = await makeService();
    await expect(service.loginAsPersona('9999999')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.listPersonas (persona-picker homologação)', () => {
  it('lista todos os mocks sem expor senhaHash', async () => {
    const service = await makeService();
    const list = await service.listPersonas();
    expect(list.length).toBe(MOCK_USERS.length);
    const heitor = list.find((u) => u.nf === HEITOR.nf);
    expect(heitor).toEqual({
      nf: HEITOR.nf,
      nome: HEITOR.nome,
      posto: HEITOR.posto,
      papeis: HEITOR.papeis,
    });
    expect(heitor).not.toHaveProperty('senhaHash');
  });
});

// ── S2.7 — Admin CRUD ─────────────────────────────────────────────

describe('AuthService — Admin CRUD (S2.7)', () => {
  let service: AuthService;
  beforeEach(async () => {
    service = await makeService();
  });

  it('listUsuarios retorna todos sem senhaHash', async () => {
    const list = await service.listUsuarios();
    expect(list.length).toBeGreaterThanOrEqual(MOCK_USERS.length);
    for (const u of list) {
      expect(u).not.toHaveProperty('senhaHash');
    }
  });

  it('listUsuarios ordena por nome', async () => {
    const list = await service.listUsuarios();
    for (let i = 1; i < list.length; i += 1) {
      expect(list[i - 1]!.nome.localeCompare(list[i]!.nome)).toBeLessThanOrEqual(0);
    }
  });

  it('createUsuario cria com primeiroAcesso=true + senha default', async () => {
    const novo = await service.createUsuario({
      nf: '9999999',
      nome: 'TESTE SILVA',
      posto: 'SD',
      ant: 500,
      papeis: ['militar'],
    });
    expect(novo.nf).toBe('9999999');
    expect(novo.primeiroAcesso).toBe(true);
    const { user } = await service.login({ nf: '9999999', senha: 'batalhao01' });
    expect(user.nome).toBe('TESTE SILVA');
  });

  it('createUsuario aceita senhaInicial customizada', async () => {
    await service.createUsuario({
      nf: '9999998',
      nome: 'OUTRO TESTE',
      posto: 'CB',
      ant: 700,
      papeis: ['fiscal'],
      senhaInicial: 'minhasenha123',
    });
    const { user } = await service.login({ nf: '9999998', senha: 'minhasenha123' });
    expect(user.papeis).toContain('fiscal');
  });

  it('createUsuario rejeita NF duplicada com ConflictException', async () => {
    await expect(
      service.createUsuario({
        nf: HEITOR.nf,
        nome: 'OUTRO',
        posto: 'SD',
        ant: 100,
        papeis: ['militar'],
      }),
    ).rejects.toThrow(/já existe/);
  });

  it('updateUsuario altera campos parciais', async () => {
    const created = await service.createUsuario({
      nf: '9999997',
      nome: 'ORIGINAL',
      posto: 'SD',
      ant: 100,
      papeis: ['militar'],
    });
    const updated = await service.updateUsuario(created.nf, {
      nome: 'ALTERADO',
      papeis: ['militar', 'fiscal'],
    });
    expect(updated.nome).toBe('ALTERADO');
    expect(updated.papeis).toEqual(['militar', 'fiscal']);
    expect(updated.posto).toBe('SD');
  });

  it('updateUsuario com resetSenha=true volta para batalhao01 + primeiroAcesso=true', async () => {
    await service.createUsuario({
      nf: '9999996',
      nome: 'USER',
      posto: 'SD',
      ant: 100,
      papeis: ['militar'],
      senhaInicial: 'outrasenha',
    });
    await service.changePassword('9999996', {
      senhaAtual: 'outrasenha',
      novaSenha: 'novaSenha123!',
      confirmacao: 'novaSenha123!',
      email: 'user9999996@cbmes.es.gov.br',
    });
    const updated = await service.updateUsuario('9999996', { resetSenha: true });
    expect(updated.primeiroAcesso).toBe(true);
    const { user } = await service.login({ nf: '9999996', senha: 'batalhao01' });
    expect(user.primeiroAcesso).toBe(true);
  });

  it('updateUsuario lança NotFound se NF não existe', async () => {
    await expect(service.updateUsuario('0000000', { nome: 'X' })).rejects.toThrow(/não encontrado/);
  });

  it('removeUsuario (soft delete) bloqueia próxima leitura', async () => {
    await service.createUsuario({
      nf: '9999995',
      nome: 'TEMP',
      posto: 'SD',
      ant: 100,
      papeis: ['militar'],
    });
    await service.removeUsuario('9999995', HEITOR.nf);
    await expect(service.login({ nf: '9999995', senha: 'batalhao01' })).rejects.toThrow();
  });

  it('removeUsuario impede auto-deleção', async () => {
    await expect(service.removeUsuario(HEITOR.nf, HEITOR.nf)).rejects.toThrow(/sua própria conta/);
  });

  it('removeUsuario lança NotFound se NF não existe', async () => {
    await expect(service.removeUsuario('0000000', HEITOR.nf)).rejects.toThrow(/não encontrado/);
  });
});
