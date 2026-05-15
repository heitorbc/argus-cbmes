import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateLocalFaxinaInput,
  LocalFaxina,
  UpdateLocalFaxinaInput,
} from '@argus/shared-types';

/**
 * Cadastro mestre de Locais de Faxina (in-memory, padrão Fase 1).
 *
 * Bootstrap dev cria 9 locais default informados pelo Tech Lead. Em prod,
 * o admin gerencia via `/cadastros/locais-faxina`.
 */
const DEFAULT_LOCAIS = [
  'RECOLHIMENTO DO LIXO',
  'ALOJ. MASC. ST/SGT',
  'CASSINO',
  'CORREDOR E ESCADA',
  'COZINHA',
  'ALOJ. E BANHEIRO CB/SD',
  'ALOJ. FEM. CB/SD',
  'ALOJ. FEM. ST/SGT',
  'ÁREA DA GUARDA',
];

@Injectable()
export class LocaisFaxinaService implements OnModuleInit {
  private readonly logger = new Logger(LocaisFaxinaService.name);
  private readonly byId: Map<string, LocalFaxina> = new Map();

  onModuleInit(): void {
    if (process.env.NODE_ENV !== 'development') return;
    if (this.byId.size > 0) return;
    const now = new Date().toISOString();
    for (const [i, nome] of DEFAULT_LOCAIS.entries()) {
      const id = randomUUID();
      this.byId.set(id, {
        id,
        nome,
        ordem: i + 1,
        ativo: true,
        criadoEm: now,
        atualizadoEm: now,
      });
    }
    this.logger.log(`Locais Faxina: ${DEFAULT_LOCAIS.length} defaults dev carregados.`);
  }

  list(opts: { ativosOnly?: boolean } = {}): LocalFaxina[] {
    const all = Array.from(this.byId.values()).sort((a, b) => a.ordem - b.ordem);
    return opts.ativosOnly ? all.filter((l) => l.ativo) : all;
  }

  findById(id: string): LocalFaxina {
    const found = this.byId.get(id);
    if (!found) throw new NotFoundException(`Local de faxina ${id} não encontrado`);
    return found;
  }

  create(input: CreateLocalFaxinaInput): LocalFaxina {
    const nomeNorm = input.nome.trim();
    if (Array.from(this.byId.values()).some((l) => l.nome.toLowerCase() === nomeNorm.toLowerCase())) {
      throw new ConflictException(`Local "${nomeNorm}" já existe`);
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    const ordem = input.ordem ?? Math.max(0, ...Array.from(this.byId.values()).map((l) => l.ordem)) + 1;
    const local: LocalFaxina = {
      id,
      nome: nomeNorm,
      ordem,
      ativo: true,
      criadoEm: now,
      atualizadoEm: now,
    };
    this.byId.set(id, local);
    return local;
  }

  update(id: string, input: UpdateLocalFaxinaInput): LocalFaxina {
    const current = this.findById(id);
    if (input.nome !== undefined) {
      const nomeNorm = input.nome.trim();
      const conflict = Array.from(this.byId.values()).some(
        (l) => l.id !== id && l.nome.toLowerCase() === nomeNorm.toLowerCase(),
      );
      if (conflict) throw new ConflictException(`Local "${nomeNorm}" já existe`);
    }
    const updated: LocalFaxina = {
      ...current,
      nome: input.nome?.trim() ?? current.nome,
      ordem: input.ordem ?? current.ordem,
      ativo: input.ativo ?? current.ativo,
      atualizadoEm: new Date().toISOString(),
    };
    this.byId.set(id, updated);
    return updated;
  }

  softDelete(id: string): LocalFaxina {
    return this.update(id, { ativo: false });
  }

  /** Para tests. */
  reset(): void {
    this.byId.clear();
  }
}
