import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common';

/** HTTP 423 Locked — não está em HttpStatus do NestJS 10. */
const HTTP_LOCKED = 423;
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type {
  ChangePasswordInput,
  CreateUsuarioInput,
  LoginInput,
  UpdateUsuarioInput,
  UserSession,
} from '@argus/shared-types';
import { MOCK_USERS, type MockUser } from './mock-users';
import { LoginRateLimiter } from './login-rate-limiter';

/** S2.7 — Senha default para usuários criados via admin. */
const DEFAULT_SENHA = 'batalhao01';

/** Tempo de vida do JWT (8h, alinhado a turno operacional). */
export const JWT_TTL_SECONDS = 8 * 60 * 60;

@Injectable()
export class AuthService {
  /** Em S1, sobrescreve mock-users em memória; em S5+, persistência via Prisma. */
  private readonly users: Map<string, MockUser> = new Map(MOCK_USERS.map((u) => [u.nf, { ...u }]));

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly rateLimiter: LoginRateLimiter,
  ) {}

  async login(input: LoginInput): Promise<{ user: UserSession; token: string }> {
    const blockedUntil = this.rateLimiter.blockedUntil(input.nf);
    if (blockedUntil > 0) {
      const restantes = Math.ceil((blockedUntil - Date.now()) / 1000 / 60);
      throw new HttpException(
        `Muitas tentativas falhas. Tente novamente em ${restantes} minutos.`,
        HTTP_LOCKED,
      );
    }

    const user = this.users.get(input.nf);
    if (!user) {
      this.rateLimiter.registerFailure(input.nf);
      throw new UnauthorizedException('NF ou senha inválidos');
    }

    const ok = await bcrypt.compare(input.senha, user.senhaHash);
    if (!ok) {
      this.rateLimiter.registerFailure(input.nf);
      throw new UnauthorizedException('NF ou senha inválidos');
    }

    this.rateLimiter.reset(input.nf);

    const session = this.toSession(user);
    const token = await this.signToken(session);
    return { user: session, token };
  }

  async changePassword(nf: string, input: ChangePasswordInput): Promise<UserSession> {
    const user = this.users.get(nf);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const ok = await bcrypt.compare(input.senhaAtual, user.senhaHash);
    if (!ok) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    const cost = Number(this.config.get<string>('BCRYPT_COST') ?? 12);
    user.senhaHash = await bcrypt.hash(input.novaSenha, cost);
    user.primeiroAcesso = false;

    return this.toSession(user);
  }

  /**
   * Login sem senha — usado pelo persona-picker de homologação.
   *
   * **Gated por env flag `ARGUS_PERSONA_PICKER=true`** no controller.
   * Não chamar em produção. Emite JWT com `primeiroAcesso=false` sempre
   * (não há senha pra trocar nesse modo).
   */
  async loginAsPersona(nf: string): Promise<{ user: UserSession; token: string }> {
    const user = this.users.get(nf);
    if (!user) {
      throw new UnauthorizedException('Persona não encontrada');
    }
    const session: UserSession = { ...this.toSession(user), primeiroAcesso: false };
    const token = await this.signToken(session);
    return { user: session, token };
  }

  /**
   * Lista personas disponíveis para o picker (apenas campos públicos —
   * NUNCA expõe `senhaHash`/`cpfFake`).
   */
  listPersonas(): Array<{
    nf: string;
    nome: string;
    posto: string;
    papeis: UserSession['papeis'];
  }> {
    return Array.from(this.users.values()).map((u) => ({
      nf: u.nf,
      nome: u.nome,
      posto: u.posto,
      papeis: u.papeis,
    }));
  }

  getCurrentUser(nf: string): UserSession {
    const user = this.users.get(nf);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    return this.toSession(user);
  }

  async signToken(session: UserSession): Promise<string> {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    return this.jwt.signAsync(session, { secret, expiresIn: JWT_TTL_SECONDS });
  }

  private toSession(user: MockUser): UserSession {
    return {
      nf: user.nf,
      nome: user.nome,
      posto: user.posto,
      ant: user.ant,
      papeis: user.papeis,
      primeiroAcesso: user.primeiroAcesso,
    };
  }

  // ── S2.7 — Admin CRUD de usuários ───────────────────────────────

  /**
   * Lista todos os usuários cadastrados (sem campos sensíveis). Ordena
   * por nome para facilitar busca visual.
   */
  listUsuarios(): UserSession[] {
    return Array.from(this.users.values())
      .map((u) => this.toSession(u))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }

  /**
   * Cria novo usuário. NF é a chave única — colisão rejeita com 409.
   * Senha inicial: parâmetro `senhaInicial` ou DEFAULT_SENHA. `primeiroAcesso`
   * sempre true (força troca no 1º login).
   */
  async createUsuario(input: CreateUsuarioInput): Promise<UserSession> {
    if (this.users.has(input.nf)) {
      throw new ConflictException(`Usuário NF ${input.nf} já existe`);
    }
    const senha = input.senhaInicial ?? DEFAULT_SENHA;
    const cost = Number(this.config.get<string>('BCRYPT_COST') ?? 12);
    const novo: MockUser = {
      nf: input.nf,
      nome: input.nome,
      posto: input.posto,
      ant: input.ant,
      cpfFake: senha,
      senhaHash: await bcrypt.hash(senha, cost),
      papeis: input.papeis,
      primeiroAcesso: true,
    };
    this.users.set(novo.nf, novo);
    return this.toSession(novo);
  }

  /**
   * Atualiza usuário existente. NF é imutável. `resetSenha=true` reseta
   * para DEFAULT_SENHA e marca primeiroAcesso=true.
   */
  async updateUsuario(nf: string, input: UpdateUsuarioInput): Promise<UserSession> {
    const user = this.users.get(nf);
    if (!user) {
      throw new NotFoundException(`Usuário NF ${nf} não encontrado`);
    }
    if (input.nome !== undefined) user.nome = input.nome;
    if (input.posto !== undefined) user.posto = input.posto;
    if (input.ant !== undefined) user.ant = input.ant;
    if (input.papeis !== undefined) user.papeis = input.papeis;
    if (input.resetSenha) {
      const cost = Number(this.config.get<string>('BCRYPT_COST') ?? 12);
      user.cpfFake = DEFAULT_SENHA;
      user.senhaHash = await bcrypt.hash(DEFAULT_SENHA, cost);
      user.primeiroAcesso = true;
    }
    return this.toSession(user);
  }

  /** Remove usuário. Não permite auto-deleção (admin não pode deletar a si mesmo). */
  removeUsuario(nf: string, currentUserNf: string): void {
    if (nf === currentUserNf) {
      throw new ConflictException('Você não pode remover sua própria conta');
    }
    if (!this.users.has(nf)) {
      throw new NotFoundException(`Usuário NF ${nf} não encontrado`);
    }
    this.users.delete(nf);
  }
}
