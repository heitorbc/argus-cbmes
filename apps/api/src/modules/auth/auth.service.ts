import {
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

/** HTTP 423 Locked — não está em HttpStatus do NestJS 10. */
const HTTP_LOCKED = 423;
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import type {
  ChangePasswordInput,
  CreateUsuarioInput,
  LoginInput,
  Papel,
  UpdateUsuarioInput,
  UserSession,
} from '@argus/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EfetivoService } from '../efetivo/efetivo.service';
import { LoginRateLimiter } from './login-rate-limiter';

/** S2.7 — Senha default para usuários criados via admin. */
const DEFAULT_SENHA = 'batalhao01';

/** Tempo de vida do JWT (8h, alinhado a turno operacional). */
export const JWT_TTL_SECONDS = 8 * 60 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly rateLimiter: LoginRateLimiter,
    private readonly efetivo: EfetivoService,
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

    // S2.10.4 — auto-provision: se o NF existe no Efetivo mas não há User,
    // cria com senha padrão + primeiroAcesso=true. Continua o fluxo normal.
    let user = await this.findActiveByNf(input.nf);
    if (!user) {
      user = await this.tryProvisionFromEfetivo(input.nf);
    }
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

    // Marca último login (fire-and-forget — falha aqui não impede o login).
    void this.prisma.user
      .update({ where: { nf: input.nf }, data: { ultimoLoginEm: new Date() } })
      .catch(() => undefined);

    const session = this.toSession(user);
    const token = await this.signToken(session);
    return { user: session, token };
  }

  async changePassword(nf: string, input: ChangePasswordInput): Promise<UserSession> {
    const user = await this.findActiveByNf(nf);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const ok = await bcrypt.compare(input.senhaAtual, user.senhaHash);
    if (!ok) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    // S2.10.4 — email obrigatório no 1º acesso (validado pelo frontend).
    // Backend confia: se vier, persiste; se não vier e já tem, mantém.
    if (user.primeiroAcesso && !input.email && !user.email) {
      throw new ConflictException('E-mail é obrigatório no primeiro acesso');
    }

    // Email único: se vier um e já existir em outro user, rejeita 409.
    if (input.email && input.email !== user.email) {
      const conflict = await this.prisma.user.findUnique({ where: { email: input.email } });
      if (conflict && conflict.nf !== nf) {
        throw new ConflictException('E-mail já está em uso por outro usuário');
      }
    }

    const cost = this.bcryptCost();
    const senhaHash = await bcrypt.hash(input.novaSenha, cost);
    const updated = await this.prisma.user.update({
      where: { nf },
      data: {
        senhaHash,
        primeiroAcesso: false,
        ...(input.email ? { email: input.email } : {}),
      },
    });
    return this.toSession(updated);
  }

  /**
   * Login sem senha — usado pelo persona-picker de homologação.
   *
   * **Gated por env flag `ARGUS_PERSONA_PICKER=true`** no controller.
   * Não chamar em produção.
   */
  async loginAsPersona(nf: string): Promise<{ user: UserSession; token: string }> {
    const user = await this.findActiveByNf(nf);
    if (!user) {
      throw new UnauthorizedException('Persona não encontrada');
    }
    const session: UserSession = { ...this.toSession(user), primeiroAcesso: false };
    const token = await this.signToken(session);
    return { user: session, token };
  }

  async listPersonas(): Promise<
    Array<{ nf: string; nome: string; posto: string; papeis: UserSession['papeis'] }>
  > {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: { nf: true, nome: true, posto: true, papeis: true },
    });
    return users.map((u) => ({
      nf: u.nf,
      nome: u.nome,
      posto: u.posto,
      papeis: u.papeis as Papel[],
    }));
  }

  async getCurrentUser(nf: string): Promise<UserSession> {
    const user = await this.findActiveByNf(nf);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    return this.toSession(user);
  }

  async signToken(session: UserSession): Promise<string> {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    return this.jwt.signAsync(session, { secret, expiresIn: JWT_TTL_SECONDS });
  }

  private toSession(user: User): UserSession {
    return {
      nf: user.nf,
      nome: user.nome,
      nomeGuerra: user.nomeGuerra ?? undefined,
      posto: user.posto,
      ant: user.ant,
      papeis: user.papeis as Papel[],
      primeiroAcesso: user.primeiroAcesso,
      email: user.email ?? undefined,
    };
  }

  private async findActiveByNf(nf: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { nf, deletedAt: null } });
  }

  private bcryptCost(): number {
    return Number(this.config.get<string>('BCRYPT_COST') ?? 12);
  }

  /**
   * S2.10.4 — Cria User para militar do Efetivo que tenta login pela 1ª vez.
   * Tolerante a falha do EfetivoService (cache stale ou serviço externo down)
   * — retorna null se não conseguir confirmar o militar.
   */
  private async tryProvisionFromEfetivo(nf: string): Promise<User | null> {
    let militar;
    try {
      militar = await this.efetivo.findByNf(nf);
    } catch {
      return null;
    }
    if (!militar) return null;

    const senhaHash = await bcrypt.hash(DEFAULT_SENHA, this.bcryptCost());
    try {
      return await this.prisma.user.create({
        data: {
          nf: militar.nf,
          nome: militar.nome,
          nomeGuerra: militar.nomeGuerra ?? null,
          posto: militar.posto,
          ant: militar.ant,
          papeis: ['militar'],
          senhaHash,
          primeiroAcesso: true,
        },
      });
    } catch {
      // Race condition: outro request criou primeiro — busca o que existe.
      return this.findActiveByNf(nf);
    }
  }

  // ── S2.7 — Admin CRUD de usuários ───────────────────────────────

  async listUsuarios(): Promise<UserSession[]> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { nome: 'asc' },
    });
    return users.map((u) => this.toSession(u));
  }

  async createUsuario(input: CreateUsuarioInput): Promise<UserSession> {
    const existing = await this.prisma.user.findUnique({ where: { nf: input.nf } });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(`Usuário NF ${input.nf} já existe`);
    }
    const senha = input.senhaInicial ?? DEFAULT_SENHA;
    const senhaHash = await bcrypt.hash(senha, this.bcryptCost());
    const data = {
      nf: input.nf,
      nome: input.nome,
      posto: input.posto,
      ant: input.ant,
      papeis: input.papeis,
      senhaHash,
      primeiroAcesso: true,
      deletedAt: null,
    };
    const user = existing
      ? await this.prisma.user.update({ where: { nf: input.nf }, data })
      : await this.prisma.user.create({ data });
    return this.toSession(user);
  }

  async updateUsuario(nf: string, input: UpdateUsuarioInput): Promise<UserSession> {
    const user = await this.findActiveByNf(nf);
    if (!user) {
      throw new NotFoundException(`Usuário NF ${nf} não encontrado`);
    }
    const data: {
      nome?: string;
      posto?: string;
      ant?: number;
      papeis?: Papel[];
      senhaHash?: string;
      primeiroAcesso?: boolean;
    } = {};
    if (input.nome !== undefined) data.nome = input.nome;
    if (input.posto !== undefined) data.posto = input.posto;
    if (input.ant !== undefined) data.ant = input.ant;
    if (input.papeis !== undefined) data.papeis = input.papeis;
    if (input.resetSenha) {
      data.senhaHash = await bcrypt.hash(DEFAULT_SENHA, this.bcryptCost());
      data.primeiroAcesso = true;
    }
    const updated = await this.prisma.user.update({ where: { nf }, data });
    return this.toSession(updated);
  }

  async removeUsuario(nf: string, currentUserNf: string): Promise<void> {
    if (nf === currentUserNf) {
      throw new ConflictException('Você não pode remover sua própria conta');
    }
    const user = await this.findActiveByNf(nf);
    if (!user) {
      throw new NotFoundException(`Usuário NF ${nf} não encontrado`);
    }
    await this.prisma.user.update({ where: { nf }, data: { deletedAt: new Date() } });
  }

  /**
   * S2.10.4 — Troca senha via reset token Supabase (sem precisar de
   * senha atual). Caller (`AuthController`) já validou o token via
   * `AuthSupabaseService.validateResetToken()` e passa o email aqui.
   */
  async resetPasswordByEmail(email: string, novaSenha: string): Promise<UserSession> {
    const user = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado para o email informado');
    }
    const cost = this.bcryptCost();
    const senhaHash = await bcrypt.hash(novaSenha, cost);
    const updated = await this.prisma.user.update({
      where: { nf: user.nf },
      data: { senhaHash, primeiroAcesso: false },
    });
    return this.toSession(updated);
  }
}
