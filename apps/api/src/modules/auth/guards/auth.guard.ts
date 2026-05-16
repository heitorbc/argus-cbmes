import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { UserSession } from '@argus/shared-types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: UserSession }>();
    const token = this.extractToken(req);

    if (!token) {
      throw new UnauthorizedException('Sessão ausente');
    }

    try {
      const secret = this.config.getOrThrow<string>('JWT_SECRET');
      const payload = await this.jwt.verifyAsync<UserSession>(token, { secret });
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }
  }

  /**
   * S2.4 — Extrai JWT em ordem de prioridade:
   *   1. `Authorization: Bearer <token>` header (preferido em SPA cross-origin
   *      pois browsers bloqueiam cada vez mais cookies 3rd-party)
   *   2. Cookie `argus_session` (fallback / compat com clients antigos)
   *
   * Defesa em profundidade — qualquer um dos dois funciona.
   */
  private extractToken(req: Request): string | undefined {
    const authHeader = req.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      if (token) return token;
    }
    const cookieName = 'argus_session';
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[cookieName];
  }
}
