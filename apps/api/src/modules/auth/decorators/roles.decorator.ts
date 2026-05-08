import { SetMetadata } from '@nestjs/common';
import type { Papel } from '@argus/shared-types';

export const ROLES_KEY = 'roles';

/**
 * Marca uma rota como exigindo um ou mais papéis.
 * Uso: `@Roles('admin')` ou `@Roles('admin', 'fiscal')` (qualquer um basta).
 */
export const Roles = (...papeis: Papel[]) => SetMetadata(ROLES_KEY, papeis);
