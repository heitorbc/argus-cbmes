import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { z } from 'zod';
import {
  changePasswordInputSchema,
  loginInputSchema,
  type LoginResponse,
  type UserSession,
} from '@argus/shared-types';
import { AuthService, JWT_TTL_SECONDS } from './auth.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

const personaLoginSchema = z.object({ nf: z.string().min(1) });

const COOKIE_NAME = 'argus_session';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const parsed = loginInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }

    const { user, token } = await this.authService.login(parsed.data);
    this.setSessionCookie(res, token);
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(COOKIE_NAME, { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() user: UserSession): UserSession {
    return user;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: UserSession,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserSession }> {
    const parsed = changePasswordInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }

    const updated = await this.authService.changePassword(user.nf, parsed.data);
    const token = await this.authService.signToken(updated);
    this.setSessionCookie(res, token);
    return { user: updated };
  }

  /**
   * Persona Picker — bypass de homologação.
   *
   * Endpoints `/auth/dev/*` só existem se `ARGUS_PERSONA_PICKER=true`. Caso
   * contrário lançam `404 Not Found` (esconde a existência da rota). Não
   * usar em produção.
   */
  @Public()
  @Get('dev/personas')
  listPersonas(): Array<{
    nf: string;
    nome: string;
    posto: string;
    papeis: UserSession['papeis'];
  }> {
    this.assertPersonaPickerEnabled();
    return this.authService.listPersonas();
  }

  @Public()
  @Post('dev/persona-login')
  @HttpCode(HttpStatus.OK)
  async personaLogin(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    this.assertPersonaPickerEnabled();
    const parsed = personaLoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    const { user, token } = await this.authService.loginAsPersona(parsed.data.nf);
    this.setSessionCookie(res, token);
    return { user };
  }

  private assertPersonaPickerEnabled(): void {
    if (this.config.get<string>('ARGUS_PERSONA_PICKER') !== 'true') {
      throw new NotFoundException();
    }
  }

  private setSessionCookie(res: Response, token: string): void {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: JWT_TTL_SECONDS * 1000,
    });
  }
}
