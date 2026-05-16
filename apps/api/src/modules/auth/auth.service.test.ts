import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginRateLimiter } from './login-rate-limiter';
import { MOCK_USERS } from './mock-users';

function makeService(): AuthService {
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
  return new AuthService(jwt, config, new LoginRateLimiter());
}

const HEITOR = MOCK_USERS[0]; // 3037509 / cpfFake = '11122233344'

describe('AuthService.login', () => {
  let service: AuthService;
  beforeEach(() => {
    service = makeService();
  });

  it('autentica com NF e CPF mock corretos', async () => {
    const result = await service.login({ nf: HEITOR.nf, senha: HEITOR.cpfFake });
    expect(result.user.nf).toBe(HEITOR.nf);
    expect(result.user.nome).toBe(HEITOR.nome);
    expect(result.user.papeis).toContain('admin');
    expect(result.token).toBeDefined();
    expect(result.token.split('.').length).toBe(3); // JWT formato xxx.yyy.zzz
  });

  it('retorna primeiroAcesso=true para usuário recém-cadastrado', async () => {
    const result = await service.login({ nf: HEITOR.nf, senha: HEITOR.cpfFake });
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
    // 6ª tentativa (mesmo com senha correta) deve dar 423
    await expect(service.login({ nf: HEITOR.nf, senha: HEITOR.cpfFake })).rejects.toThrow(
      HttpException,
    );
  }, 15_000); // bcrypt cost 12 × 6 compares pode ultrapassar 5s em hardware mais lento

  it('reseta contador de falhas após login bem-sucedido', async () => {
    // 4 falhas (não bloqueia)
    for (let i = 0; i < 4; i++) {
      await expect(service.login({ nf: HEITOR.nf, senha: 'errada' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    // login certo zera o contador
    await service.login({ nf: HEITOR.nf, senha: HEITOR.cpfFake });
    // mais 4 falhas seguidas — não deve bloquear (contador foi zerado)
    for (let i = 0; i < 4; i++) {
      await expect(service.login({ nf: HEITOR.nf, senha: 'errada' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  }, 15_000); // bcrypt cost 12 × 9 compares pode ultrapassar 5s em hardware mais lento
});

describe('AuthService.changePassword', () => {
  let service: AuthService;
  beforeEach(() => {
    service = makeService();
  });

  it('troca senha com sucesso e marca primeiroAcesso=false', async () => {
    const updated = await service.changePassword(HEITOR.nf, {
      senhaAtual: HEITOR.cpfFake,
      novaSenha: 'NovaSenhaForte123',
      confirmacao: 'NovaSenhaForte123',
    });
    expect(updated.primeiroAcesso).toBe(false);

    // depois login com nova senha funciona
    const loginNovo = await service.login({ nf: HEITOR.nf, senha: 'NovaSenhaForte123' });
    expect(loginNovo.user.nf).toBe(HEITOR.nf);
    expect(loginNovo.user.primeiroAcesso).toBe(false);

    // login com senha antiga falha
    await expect(service.login({ nf: HEITOR.nf, senha: HEITOR.cpfFake })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
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
  it('retorna o usuário pelo NF', () => {
    const service = makeService();
    const user = service.getCurrentUser(HEITOR.nf);
    expect(user.nome).toBe(HEITOR.nome);
    expect(user.posto).toBe(HEITOR.posto);
  });

  it('lança 401 para NF inexistente', () => {
    const service = makeService();
    expect(() => service.getCurrentUser('9999999')).toThrow(UnauthorizedException);
  });
});

describe('AuthService.loginAsPersona (persona-picker homologação)', () => {
  it('emite JWT válido + primeiroAcesso=false para persona existente', async () => {
    const service = makeService();
    const result = await service.loginAsPersona(HEITOR.nf);
    expect(result.user.nf).toBe(HEITOR.nf);
    expect(result.user.papeis).toContain('admin');
    expect(result.user.primeiroAcesso).toBe(false); // bypass sempre força false
    expect(result.token.split('.').length).toBe(3);
  });

  it('lança 401 para persona inexistente', async () => {
    const service = makeService();
    await expect(service.loginAsPersona('9999999')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.listPersonas (persona-picker homologação)', () => {
  it('lista todos os mocks sem expor senhaHash', () => {
    const service = makeService();
    const list = service.listPersonas();
    expect(list.length).toBe(MOCK_USERS.length);
    expect(list[0]).toEqual({
      nf: MOCK_USERS[0]!.nf,
      nome: MOCK_USERS[0]!.nome,
      posto: MOCK_USERS[0]!.posto,
      papeis: MOCK_USERS[0]!.papeis,
    });
    // Tipagem garante; checagem extra em runtime:
    expect(list[0]).not.toHaveProperty('senhaHash');
    expect(list[0]).not.toHaveProperty('cpfFake');
  });
});

// ── S2.7 — Admin CRUD ─────────────────────────────────────────────

describe('AuthService — Admin CRUD (S2.7)', () => {
  let service: AuthService;
  beforeEach(() => {
    service = makeService();
  });

  it('listUsuarios retorna todos sem senhaHash/cpfFake', () => {
    const list = service.listUsuarios();
    expect(list.length).toBeGreaterThanOrEqual(MOCK_USERS.length);
    for (const u of list) {
      expect(u).not.toHaveProperty('senhaHash');
      expect(u).not.toHaveProperty('cpfFake');
    }
  });

  it('listUsuarios ordena por nome', () => {
    const list = service.listUsuarios();
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
    // Login com senha default funciona
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
        nf: HEITOR!.nf, // Heitor já existe
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
    expect(updated.posto).toBe('SD'); // não foi alterado
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
    // Marca como já logou (simula troca de senha completada)
    await service.changePassword('9999996', {
      senhaAtual: 'outrasenha',
      novaSenha: 'novaSenha123!',
      confirmacao: 'novaSenha123!',
    });
    const updated = await service.updateUsuario('9999996', { resetSenha: true });
    expect(updated.primeiroAcesso).toBe(true);
    // Login com senha default funciona de novo
    const { user } = await service.login({ nf: '9999996', senha: 'batalhao01' });
    expect(user.primeiroAcesso).toBe(true);
  });

  it('updateUsuario lança NotFound se NF não existe', async () => {
    await expect(service.updateUsuario('0000000', { nome: 'X' })).rejects.toThrow(/não encontrado/);
  });

  it('removeUsuario remove + bloqueia próxima leitura', async () => {
    await service.createUsuario({
      nf: '9999995',
      nome: 'TEMP',
      posto: 'SD',
      ant: 100,
      papeis: ['militar'],
    });
    service.removeUsuario('9999995', HEITOR!.nf);
    await expect(service.login({ nf: '9999995', senha: 'batalhao01' })).rejects.toThrow();
  });

  it('removeUsuario impede auto-deleção', () => {
    expect(() => service.removeUsuario(HEITOR!.nf, HEITOR!.nf)).toThrow(/sua própria conta/);
  });

  it('removeUsuario lança NotFound se NF não existe', () => {
    expect(() => service.removeUsuario('0000000', HEITOR!.nf)).toThrow(/não encontrado/);
  });
});
