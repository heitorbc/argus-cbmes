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

// ---------- API responses ---------- //

export const loginResponseSchema = z.object({
  user: userSessionSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const apiErrorSchema = z.object({
  statusCode: z.number(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
