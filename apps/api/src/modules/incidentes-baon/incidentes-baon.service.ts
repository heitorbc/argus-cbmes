import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import type { IncidenteBaon } from '@argus/shared-types';
import { resolveDataFile } from '../../common/dev-fixtures';
import { parseIncidentesBaonCsv } from './incidentes-baon-csv-parser';

/**
 * Catálogo BAON em memória — lê `data/incidentes_BAON_CBMES.csv` no startup
 * (idempotent) e oferece busca por código OU descrição para o combobox de
 * "Ocorrências (Não) Confeccionadas" da Parte Diária.
 *
 * Se o arquivo não estiver disponível (prod sem fixture), o service fica
 * vazio — o frontend exibe estado de fallback.
 */
@Injectable()
export class IncidentesBaonService implements OnModuleInit {
  private readonly logger = new Logger(IncidentesBaonService.name);
  private items: IncidenteBaon[] = [];

  onModuleInit(): void {
    this.bootstrapFromFilesystem();
  }

  private bootstrapFromFilesystem(): void {
    const filePath = resolveDataFile('incidentes_BAON_CBMES.csv');
    if (!filePath) {
      this.logger.warn(
        'BAON: arquivo "data/incidentes_BAON_CBMES.csv" não encontrado — catálogo vazio.',
      );
      return;
    }
    try {
      const csv = readFileSync(filePath, 'utf8');
      this.items = parseIncidentesBaonCsv(csv);
      this.logger.log(`BAON: ${this.items.length} incidentes carregados.`);
    } catch (err) {
      this.logger.error(`BAON: falha ao carregar — ${(err as Error).message}`);
    }
  }

  listAll(): IncidenteBaon[] {
    return [...this.items];
  }

  findByCodigo(codigo: string): IncidenteBaon | null {
    const norm = codigo.trim().toUpperCase();
    return this.items.find((i) => i.codigo.toUpperCase() === norm) ?? null;
  }

  /**
   * Busca por código (prefixo) OU descrição (contém). Case-insensitive,
   * normaliza acentos. Limit default 20 para combobox.
   */
  search(query: string, limit = 20): IncidenteBaon[] {
    const q = normalize(query);
    if (!q) return this.items.slice(0, limit);
    const codigoHits: IncidenteBaon[] = [];
    const descHits: IncidenteBaon[] = [];
    for (const it of this.items) {
      if (normalize(it.codigo).startsWith(q)) {
        codigoHits.push(it);
      } else if (normalize(it.descricao).includes(q)) {
        descHits.push(it);
      }
      if (codigoHits.length + descHits.length >= limit * 2) break;
    }
    return [...codigoHits, ...descHits].slice(0, limit);
  }

  /** Para tests. */
  reset(items: IncidenteBaon[] = []): void {
    this.items = [...items];
  }
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}
