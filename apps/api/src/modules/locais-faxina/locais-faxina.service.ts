import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  CreateLocalFaxinaInput,
  LocalFaxina,
  UpdateLocalFaxinaInput,
} from '@argus/shared-types';
import type { LocalFaxina as PrismaLocalFaxina } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Cadastro mestre de Locais de Faxina — persistência em Postgres (S2.10.3).
 *
 * Bootstrap dev (NODE_ENV !== production && !== test) garante 9 defaults
 * idempotentemente via `upsert` por nome — útil para dev local sem precisar
 * popular manualmente. Prod e test não tocam o seed (admin cuida via CRUD).
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

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const env = process.env.NODE_ENV;
    if (env === 'production' || env === 'test') return;
    try {
      const existing = await this.prisma.localFaxina.count();
      if (existing > 0) return;
      for (const [i, nome] of DEFAULT_LOCAIS.entries()) {
        await this.prisma.localFaxina.create({
          data: { nome, ordem: i + 1, ativo: true },
        });
      }
      this.logger.log(`Locais Faxina: ${DEFAULT_LOCAIS.length} defaults dev carregados.`);
    } catch {
      // Banco indisponível no boot — boot prossegue; admin pode re-rodar em CRUD.
    }
  }

  async list(opts: { ativosOnly?: boolean } = {}): Promise<LocalFaxina[]> {
    const rows = await this.prisma.localFaxina.findMany({ orderBy: { ordem: 'asc' } });
    const filtered = opts.ativosOnly ? rows.filter((r) => r.ativo) : rows;
    return filtered.map(toLocalFaxina);
  }

  async findById(id: string): Promise<LocalFaxina> {
    const row = await this.prisma.localFaxina.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Local de faxina ${id} não encontrado`);
    return toLocalFaxina(row);
  }

  async create(input: CreateLocalFaxinaInput): Promise<LocalFaxina> {
    const nomeNorm = input.nome.trim();
    const all = await this.prisma.localFaxina.findMany();
    if (all.some((l) => l.nome.toLowerCase() === nomeNorm.toLowerCase())) {
      throw new ConflictException(`Local "${nomeNorm}" já existe`);
    }
    const ordem = input.ordem ?? Math.max(0, ...all.map((l) => l.ordem)) + 1;
    const row = await this.prisma.localFaxina.create({
      data: { nome: nomeNorm, ordem, ativo: true },
    });
    return toLocalFaxina(row);
  }

  async update(id: string, input: UpdateLocalFaxinaInput): Promise<LocalFaxina> {
    const current = await this.prisma.localFaxina.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Local de faxina ${id} não encontrado`);
    if (input.nome !== undefined) {
      const nomeNorm = input.nome.trim();
      const all = await this.prisma.localFaxina.findMany();
      const conflict = all.some(
        (l) => l.id !== id && l.nome.toLowerCase() === nomeNorm.toLowerCase(),
      );
      if (conflict) throw new ConflictException(`Local "${nomeNorm}" já existe`);
    }
    const row = await this.prisma.localFaxina.update({
      where: { id },
      data: {
        nome: input.nome !== undefined ? input.nome.trim() : current.nome,
        ordem: input.ordem ?? current.ordem,
        ativo: input.ativo ?? current.ativo,
      },
    });
    return toLocalFaxina(row);
  }

  async softDelete(id: string): Promise<LocalFaxina> {
    return this.update(id, { ativo: false });
  }
}

function toLocalFaxina(r: PrismaLocalFaxina): LocalFaxina {
  return {
    id: r.id,
    nome: r.nome,
    ordem: r.ordem,
    ativo: r.ativo,
    criadoEm: r.criadoEm.toISOString(),
    atualizadoEm: r.atualizadoEm.toISOString(),
  };
}
