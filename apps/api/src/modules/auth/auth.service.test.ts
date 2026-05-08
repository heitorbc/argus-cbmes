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
  });

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
  });
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
