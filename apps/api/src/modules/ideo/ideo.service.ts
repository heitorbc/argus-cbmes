import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IdeoEntry, IdeoMatrix, TipoIdeo, UpsertIdeoEntryInput } from '@argus/shared-types';

interface SeedItem {
  dia: number;
  tipo: TipoIdeo;
  itens: string[];
}

/**
 * Tabela IDEO (Itens Diários de Entrega Operacional) — rotativa por dia do mês.
 *
 * Bootstrap (S5/F6b): no startup, se vazio, lê `seed-ideo-cbmes.json` (gerado pelo
 * scrape do site institucional via `pnpm scrape:ideo`) e popula as 31×2 entries.
 * Admin pode editar via tela `/cadastros/ideo` — overrides ficam em memória.
 *
 * RF-CM-115 do PRD v2.0.
 */
@Injectable()
export class IdeoService implements OnModuleInit {
  private readonly logger = new Logger(IdeoService.name);
  /** Map keyed by `${dia}:${tipo}` → entry. */
  private readonly entries: Map<string, IdeoEntry> = new Map();

  onModuleInit(): void {
    this.bootstrapFromSeed();
  }

  list(): IdeoMatrix {
    return { entries: Array.from(this.entries.values()) };
  }

  get(dia: number, tipo: TipoIdeo): IdeoEntry | null {
    return this.entries.get(IdeoService.key(dia, tipo)) ?? null;
  }

  upsert(input: UpsertIdeoEntryInput, atualizadoPorNf?: string): IdeoEntry {
    const entry: IdeoEntry = {
      dia: input.dia,
      tipo: input.tipo,
      itens: input.itens,
      atualizadoEm: new Date().toISOString(),
      atualizadoPorNf,
    };
    this.entries.set(IdeoService.key(input.dia, input.tipo), entry);
    return entry;
  }

  delete(dia: number, tipo: TipoIdeo): void {
    this.entries.delete(IdeoService.key(dia, tipo));
  }

  /**
   * Carrega entradas do `seed-ideo-cbmes.json` (gerado via scrape Puppeteer).
   * Pulado se o arquivo não existe (caso dev novo) ou se já há entries em memória.
   */
  private bootstrapFromSeed(): void {
    if (this.entries.size > 0) return;
    // Procura o seed em src/ (dev hot-reload) e dist/ (prod), fallback ao path do código.
    const candidates = [
      join(__dirname, 'seed-ideo-cbmes.json'),
      join(__dirname, '..', '..', '..', 'src', 'modules', 'ideo', 'seed-ideo-cbmes.json'),
    ];
    const seedPath = candidates.find((p) => existsSync(p));
    if (!seedPath) {
      this.logger.warn(
        `IDEO seed não encontrado (procurado em: ${candidates.join(', ')}) — rode "pnpm scrape:ideo".`,
      );
      return;
    }
    try {
      const raw = readFileSync(seedPath, 'utf8');
      const seed = JSON.parse(raw) as SeedItem[];
      const ts = new Date().toISOString();
      let count = 0;
      for (const item of seed) {
        if (item.itens.length === 0) continue;
        this.entries.set(IdeoService.key(item.dia, item.tipo), {
          dia: item.dia,
          tipo: item.tipo,
          itens: item.itens,
          atualizadoEm: ts,
          atualizadoPorNf: 'seed-cbmes-ideo',
        });
        count++;
      }
      this.logger.log(`IDEO bootstrap: ${count} entries carregadas do seed.`);
    } catch (err) {
      this.logger.error(`Falha ao carregar IDEO seed: ${(err as Error).message}`);
    }
  }

  private static key(dia: number, tipo: TipoIdeo): string {
    return `${dia}:${tipo}`;
  }
}
