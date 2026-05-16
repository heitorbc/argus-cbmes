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

export const senhaForteSchema = z.string().min(12, 'Senha deve ter no mínimo 12 caracteres');

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

// ---------- Sessão / usuário autenticado ---------- //

export const userSessionSchema = z.object({
  nf: z.string(),
  nome: z.string(),
  posto: z.string(),
  ant: z.number().int().nonnegative(),
  papeis: z.array(z.enum(PAPEIS)),
  primeiroAcesso: z.boolean(),
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
});
export type CreateUsuarioInput = z.infer<typeof createUsuarioInputSchema>;

/** Atualização parcial — qualquer campo exceto NF (key imutável). */
export const updateUsuarioInputSchema = z.object({
  nome: z.string().trim().min(1).optional(),
  posto: z.string().trim().min(1).optional(),
  ant: z.number().int().nonnegative().optional(),
  papeis: z.array(z.enum(PAPEIS)).min(1).optional(),
  /** Se preenchido, reseta a senha e marca `primeiroAcesso=true`. */
  resetSenha: z.boolean().optional(),
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
