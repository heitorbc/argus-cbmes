import { z } from 'zod';

// ---------- Papéis (RBAC) ---------- //

export const PAPEIS = [
  'admin',
  'fiscal',
  'chefe_equipe',
  'cov',
  'motorista',
  'operador',
  'socorrista',
  'dro',
  'sentinela',
  'sargenteante',
  'almoxarife',
  'militar',
] as const;

export type Papel = (typeof PAPEIS)[number];

// ---------- Validators ---------- //

export const nfSchema = z.string().regex(/^\d{6,8}$/, 'NF deve ter 6 a 8 dígitos numéricos');

export const senhaInicialSchema = z
  .string()
  .regex(/^\d{11}$/, 'CPF deve conter 11 dígitos numéricos');

/**
 * S2.10.4 — Política de senha forte.
 *  - Mínimo 8 caracteres
 *  - Pelo menos uma letra (inclui acentos)
 *  - Pelo menos um número
 *  - Pelo menos um caractere especial (qualquer não-letra/não-número/não-espaço)
 *
 * Validações idênticas no frontend e backend (Zod compartilhado). UI deve
 * mostrar checklist em tempo real usando `senhaCriteriosAtendidos()`.
 */
export const senhaForteSchema = z
  .string()
  .min(8, 'Senha deve ter no mínimo 8 caracteres')
  .regex(/[A-Za-zÀ-ÿ]/, 'Senha deve conter pelo menos uma letra')
  .regex(/\d/, 'Senha deve conter pelo menos um número')
  .regex(/[^A-Za-z0-9À-ÿ\s]/, 'Senha deve conter pelo menos um caractere especial');

/** Checklist por critério — usado pelo `PasswordInput` para feedback live. */
export interface SenhaCriteriosAtendidos {
  comprimento: boolean;
  letra: boolean;
  numero: boolean;
  especial: boolean;
}

export function senhaCriteriosAtendidos(senha: string): SenhaCriteriosAtendidos {
  return {
    comprimento: senha.length >= 8,
    letra: /[A-Za-zÀ-ÿ]/.test(senha),
    numero: /\d/.test(senha),
    especial: /[^A-Za-z0-9À-ÿ\s]/.test(senha),
  };
}

// ---------- Login ---------- //

export const loginInputSchema = z.object({
  nf: nfSchema,
  senha: z.string().min(1, 'Senha obrigatória'),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

// ---------- Change Password ---------- //

export const changePasswordInputSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Senha atual obrigatória'),
    novaSenha: senhaForteSchema,
    confirmacao: z.string(),
    /**
     * S2.10.4 — email para cadastro/atualização. Obrigatório no 1º acesso
     * (frontend valida via `primeiroAcesso` do UserSession), opcional nas
     * trocas seguintes. Backend persiste em `User.email` (unique).
     */
    email: z.string().email('E-mail inválido').optional(),
  })
  .refine((data) => data.novaSenha === data.confirmacao, {
    message: 'Confirmação não confere',
    path: ['confirmacao'],
  })
  .refine((data) => data.senhaAtual !== data.novaSenha, {
    message: 'Nova senha deve ser diferente da atual',
    path: ['novaSenha'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

// ---------- Forgot password ---------- //

/**
 * S2.10.4 — Solicitação de recuperação de senha por email.
 * Backend busca User por NF; se email cadastrado, dispara Supabase Auth Email.
 * Se email ausente, responde com mensagem explícita "Contate o administrador"
 * (única exceção à política anti-enumeration — admin precisa cadastrar email).
 */
export const forgotPasswordInputSchema = z.object({
  nf: nfSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;

// ---------- Sessão / usuário autenticado ---------- //

export const userSessionSchema = z.object({
  nf: z.string(),
  nome: z.string(),
  /** Nome de guerra (do QDI) — usado em formatDisplayName para exibição padrão. */
  nomeGuerra: z.string().optional(),
  posto: z.string(),
  ant: z.number().int().nonnegative(),
  papeis: z.array(z.enum(PAPEIS)),
  primeiroAcesso: z.boolean(),
  /** Email cadastrado para recuperação de senha. Coletado no 1º acesso. */
  email: z.string().optional(),
  /**
   * S2.13a — Lotação do usuário (unidade institucional). NULL para admin
   * (vê todas) ou sessão criada antes do campo existir. Backend filtra a
   * maioria das queries por `unidadesVisiveisParaUsuario(user)`.
   */
  unidadeId: z.string().optional(),
});
export type UserSession = z.infer<typeof userSessionSchema>;

/**
 * S2.7 — Admin CRUD de usuários. `senhaInicial` é opcional; se omitida,
 * o backend usa `batalhao01` como default. `primeiroAcesso` é sempre
 * `true` em novos usuários (forçará troca de senha no 1º login).
 */
export const createUsuarioInputSchema = z.object({
  nf: z.string().regex(/^\d+$/, 'NF deve conter apenas dígitos'),
  nome: z.string().trim().min(1, 'Nome obrigatório'),
  posto: z.string().trim().min(1, 'Posto obrigatório'),
  ant: z.number().int().nonnegative(),
  papeis: z.array(z.enum(PAPEIS)).min(1, 'Pelo menos 1 papel'),
  senhaInicial: z.string().min(6).optional(),
  /** S2.13a — lotação do usuário. Admin cria com null para "vê tudo". */
  unidadeId: z.string().nullable().optional(),
});
export type CreateUsuarioInput = z.infer<typeof createUsuarioInputSchema>;

/**
 * Atualização parcial. NF é imutável (key). S2.10.4b: posto/nome/ant
 * vêm do QDI e não são editáveis pelo admin via UI — apenas email
 * (admin pode cadastrar/corrigir) e papeis (RBAC) + resetSenha.
 *
 * Campos QDI permanecem no schema para back-compat com chamadas
 * internas (ex.: sync futuro do EFETIVO via endpoint admin).
 */
export const updateUsuarioInputSchema = z.object({
  nome: z.string().trim().min(1).optional(),
  posto: z.string().trim().min(1).optional(),
  ant: z.number().int().nonnegative().optional(),
  /** S2.10.4b — admin pode cadastrar/corrigir email do militar. */
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  papeis: z.array(z.enum(PAPEIS)).min(1).optional(),
  /** Se preenchido, reseta a senha e marca `primeiroAcesso=true`. */
  resetSenha: z.boolean().optional(),
  /** S2.13a — admin pode alterar lotação do usuário. Null = vê tudo. */
  unidadeId: z.string().nullable().optional(),
});
export type UpdateUsuarioInput = z.infer<typeof updateUsuarioInputSchema>;

/** Listagem admin — não inclui senhaHash. */
export const usuarioAdminSchema = userSessionSchema;
export type UsuarioAdmin = UserSession;

// ---------- API responses ---------- //

/**
 * S2.4 — `token` é opcional para evitar quebra em clients antigos. O
 * frontend novo persiste e envia via `Authorization: Bearer` como
 * fallback ao cookie httpOnly. Backend continua setando o cookie em
 * paralelo (defesa em profundidade — funciona em qualquer um dos dois).
 *
 * Por que: browsers cada vez mais bloqueiam cookies 3rd-party em contexto
 * cross-site (Vercel `.vercel.app` ↔ Render `.onrender.com`). Bearer
 * token via header é o padrão SPA moderno e não sofre dessa restrição.
 */
export const loginResponseSchema = z.object({
  user: userSessionSchema,
  token: z.string().optional(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** Mesmo shape do login — change-password também devolve novo token. */
export const changePasswordResponseSchema = loginResponseSchema;
export type ChangePasswordResponse = z.infer<typeof changePasswordResponseSchema>;

export const apiErrorSchema = z.object({
  statusCode: z.number(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
