import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * S2.10.4 — Integração com Supabase Auth APENAS para envio de email de
 * recuperação de senha. Nosso JWT continua sendo a sessão da app — o
 * Supabase aqui é só transporte de email (template, SMTP).
 *
 * Fluxo:
 *  1. Usuário pede "Esqueci a senha" com NF.
 *  2. Buscamos User; se tem email cadastrado, chamamos
 *     `supabase.auth.resetPasswordForEmail(email, { redirectTo })`.
 *  3. Supabase envia magic link → usuário clica → cai em /reset-password
 *     com `access_token` no fragment.
 *  4. Frontend chama nosso `/auth/reset-password` enviando o token; backend
 *     valida via `supabase.auth.getUser(token)` e troca `senhaHash` no User.
 *
 * Sem email cadastrado: lança 400 "Contate o administrador" (única exceção
 * à política anti-enumeration porque sem email o admin precisa intervir).
 *
 * Sem `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` configurados: lança 503
 * "Recuperação por email ainda não configurada — contate o administrador."
 */
@Injectable()
export class AuthSupabaseService {
  private readonly logger = new Logger(AuthSupabaseService.name);
  private client: SupabaseClient | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private getClient(): SupabaseClient | null {
    if (this.client) return this.client;
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      this.logger.warn(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados — recuperação de senha desabilitada.',
      );
      return null;
    }
    this.client = createClient(url, key, { auth: { persistSession: false } });
    return this.client;
  }

  /**
   * Solicita envio de email de reset. Retorna void; resposta HTTP é 204
   * em todos os casos exceto: (a) email não cadastrado → 400 explícito;
   * (b) Supabase indisponível → 503.
   */
  async requestPasswordReset(nf: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { nf, deletedAt: null },
    });
    if (!user || !user.email) {
      throw new BadRequestException(
        'E-mail não cadastrado para este NF. Contate o administrador do sistema.',
      );
    }

    const client = this.getClient();
    if (!client) {
      throw new BadRequestException(
        'Recuperação por email ainda não foi configurada no servidor. Contate o administrador.',
      );
    }

    const redirectTo =
      this.config.get<string>('SUPABASE_RESET_REDIRECT_URL') ??
      `${this.config.get<string>('WEB_ORIGIN') ?? ''}/reset-password`;

    const { error } = await client.auth.resetPasswordForEmail(user.email, { redirectTo });
    if (error) {
      this.logger.error(`Falha ao enviar email para ${nf}: ${error.message}`);
      throw new BadRequestException(
        'Não foi possível enviar o email no momento. Tente novamente em alguns minutos.',
      );
    }
  }

  /**
   * Valida o `access_token` recebido do magic link (Supabase) e retorna o
   * email associado, se válido. Caller (AuthService) decide qual User
   * trocar a senha (sempre o que tem `email` igual ao retornado).
   */
  async validateResetToken(accessToken: string): Promise<{ email: string } | null> {
    const client = this.getClient();
    if (!client) return null;
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user?.email) return null;
    return { email: data.user.email };
  }
}
