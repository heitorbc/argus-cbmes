import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Resolve o caminho absoluto para uma subpasta de `data/` no workspace root.
 * Usado pelos bootstraps dev (`OnModuleInit`) que carregam fixtures locais.
 *
 * Estratégia: começa em `process.cwd()` e sobe até achar `data/<subdir>`.
 * Funciona tanto rodando a partir do workspace root (`pnpm dev`) quanto de
 * `apps/api/` (`pnpm --filter api start:dev`).
 */
export function resolveDataDir(subdir: string): string | null {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'data', subdir);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Variante para arquivo direto em `data/<filename>`. Sobe a árvore até
 * achar a raiz do workspace (que contém o arquivo).
 */
export function resolveDataFile(filename: string): string | null {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'data', filename);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
