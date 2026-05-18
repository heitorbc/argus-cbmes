import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { z } from 'zod';
import {
  changePasswordInputSchema,
  createUsuarioInputSchema,
  forgotPasswordInputSchema,
  loginInputSchema,
  senhaForteSchema,
  updateUsuarioInputSchema,
  type ChangePasswordResponse,
  type LoginResponse,
  type UserSession,
} from '@argus/shared-types';
import { AuthService, JWT_TTL_SECONDS } from './auth.service';
import { AuthSupabaseService } from './auth-supabase.service';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

const resetPasswordInputSchema = z.object({
  accessToken: z.string().min(1, 'Token obrigatório'),
  novaSenha: senhaForteSchema,
});

const personaLoginSchema = z.object({ nf: z.string().min(1) });

const COOKIE_NAME = 'argus_session';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authSupabase: AuthSupabaseService,
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
    // S2.4 — retorna token no body além do cookie (Bearer fallback para
    // browsers que bloqueiam cookies 3rd-party em cross-origin).
    return { user, token };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(COOKIE_NAME, { path: '/' });
  }

  /**
   * S2.10.4 — Solicita envio de email de recuperação. Sem email cadastrado
   * retorna 400 explícito ("Contate o administrador"); demais erros viram
   * 503 ("Recuperação por email não configurada / indisponível").
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() body: unknown): Promise<void> {
    const parsed = forgotPasswordInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    await this.authSupabase.requestPasswordReset(parsed.data.nf);
  }

  /**
   * S2.10.4 — Troca senha via token Supabase recebido pelo magic link.
   * Frontend extrai `access_token` do fragment da URL de retorno do email
   * e envia aqui para validação + troca atômica.
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const parsed = resetPasswordInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    const validated = await this.authSupabase.validateResetToken(parsed.data.accessToken);
    if (!validated) {
      throw new BadRequestException('Token de recuperação inválido ou expirado.');
    }
    const updated = await this.authService.resetPasswordByEmail(
      validated.email,
      parsed.data.novaSenha,
    );
    const token = await this.authService.signToken(updated);
    this.setSessionCookie(res, token);
    return { user: updated, token };
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
  ): Promise<ChangePasswordResponse> {
    const parsed = changePasswordInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }

    const updated = await this.authService.changePassword(user.nf, parsed.data);
    const token = await this.authService.signToken(updated);
    this.setSessionCookie(res, token);
    // S2.4 — retorna novo token (rotacionado após troca de senha) para o
    // frontend atualizar o Bearer storage.
    return { user: updated, token };
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
  async listPersonas(): Promise<
    Array<{ nf: string; nome: string; posto: string; papeis: UserSession['papeis'] }>
  > {
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
    return { user, token };
  }

  private assertPersonaPickerEnabled(): void {
    if (this.config.get<string>('ARGUS_PERSONA_PICKER') !== 'true') {
      throw new NotFoundException();
    }
  }

  // ── S2.7 — Admin CRUD de usuários ─────────────────────────────

  /**
   * Lista todos os usuários cadastrados (admin only).
   * Cuidado: papéis incluem `admin` — qualquer admin enxerga todos os outros admins.
   */
  @Roles('admin')
  @Get('usuarios')
  async listUsuarios(): Promise<UserSession[]> {
    return this.authService.listUsuarios();
  }

  @Roles('admin')
  @Post('usuarios')
  @HttpCode(HttpStatus.CREATED)
  async createUsuario(@Body() body: unknown): Promise<UserSession> {
    const parsed = createUsuarioInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.authService.createUsuario(parsed.data);
  }

  @Roles('admin')
  @Put('usuarios/:nf')
  async updateUsuario(@Param('nf') nf: string, @Body() body: unknown): Promise<UserSession> {
    const parsed = updateUsuarioInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.authService.updateUsuario(nf, parsed.data);
  }

  @Roles('admin')
  @Delete('usuarios/:nf')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeUsuario(@Param('nf') nf: string, @CurrentUser() current: UserSession): Promise<void> {
    await this.authService.removeUsuario(nf, current.nf);
  }

  private setSessionCookie(res: Response, token: string): void {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    // Em produção, frontend e backend estão em domínios distintos
    // (Vercel x Render). `SameSite=None` é obrigatório para o browser
    // enviar o cookie em requests cross-site — exige `Secure=true`.
    // Em dev (localhost), `lax` mantém DX simples sem HTTPS.
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
      path: '/',
      maxAge: JWT_TTL_SECONDS * 1000,
    });
  }
}
