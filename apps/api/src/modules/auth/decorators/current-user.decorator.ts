import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UserSession } from '@argus/shared-types';

export interface AuthenticatedRequest extends Request {
  user: UserSession;
}

/**
 * Injeta o usuário autenticado no controller.
 * Uso: `findAll(@CurrentUser() user: UserSession)`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserSession => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.user;
  },
);
