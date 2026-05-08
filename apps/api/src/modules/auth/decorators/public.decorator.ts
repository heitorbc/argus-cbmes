import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca uma rota como pública (não exige autenticação JWT).
 * Uso: `@Public()` no controller para login, health, etc.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
