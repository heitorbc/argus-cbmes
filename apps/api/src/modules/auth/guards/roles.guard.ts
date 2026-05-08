import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Papel, UserSession } from '@argus/shared-types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Papel[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user: UserSession | undefined = req.user;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const ok = required.some((p) => user.papeis.includes(p));
    if (!ok) {
      throw new ForbiddenException(`Acesso restrito aos papéis: ${required.join(', ')}`);
    }
    return true;
  }
}
