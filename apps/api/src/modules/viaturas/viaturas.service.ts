import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateViaturaInput,
  HistoricoKmEntry,
  RecursoMapaForca,
  StatusVtr,
  StatusViatura,
  TipoViatura,
  UpdateViaturaInput,
  UpsertConferenciaViaturaInput,
  Viatura,
} from '@argus/shared-types';
import type { Viatura as PrismaViatura } from '@prisma/client';
import { MapaForcaCiodesService } from '../mapa-forca-ciodes/mapa-forca-ciodes.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Mapeia o prefixo da viatura (ABTS_011, AR_044) para o tipo institucional. */
function tipoFromPrefixo(prefixo: string): TipoViatura {
  const tag = prefixo.split(/[_ ]/)[0]?.toUpperCase() ?? '';
  if (tag === 'ABTS') return 'ABTS';
  if (tag === 'AR') return 'AR';
  if (tag === 'ATB') return 'ATB';
  if (tag === 'AU') return 'AU';
  if (tag === 'AM') return 'AM';
  if (tag === 'AC') return 'AC';
  if (tag === 'TE') return 'TE';
  return 'AU';
}

function statusFromMapaForca(mf: StatusVtr | null): StatusViatura | null {
  if (mf === null) return null;
  if (mf === 'DISPONIVEL') return 'DISPONIVEL';
  if (mf === 'BAIXADA') return 'BAIXADA';
  if (mf === 'EMPRESTADA') return 'EMPRESTADA';
  return null;
}

function viaturaFromRecurso(r: RecursoMapaForca): Viatura | null {
  if (!r.vtrPrefixo) return null;
  const status = statusFromMapaForca(r.vtrStatus);
  if (status === null) return null;
  const now = new Date().toISOString();
  return {
    id: `mf:${r.vtrPrefixo}`,
    prefixo: r.vtrPrefixo,
    tipo: tipoFromPrefixo(r.vtrPrefixo),
    status,
    origem: 'mapa_forca',
    composicaoFuncoes: [],
    funcaoOperacional: r.recurso,
    observacoesDataDas: [],
    historicoKm: [],
    criadoEm: now,
    atualizadoEm: now,
  };
}

/**
 * S2.10.3 — híbrido Prisma + Mapa Força:
 * - **Lista de viaturas e status** continuam vindo do Mapa Força CIODES (planilha
 *   institucional). É a fonte de verdade pra "quais viaturas existem hoje".
 * - **Overrides do admin, historicoKm e observacoesDataDas** ficam em Postgres
 *   (tabela `viaturas`). Antes ficavam em Map in-memory e perdiam no restart.
 *
 * Regra ADR-009 preservada: viaturas com `origem === 'mapa_forca'` só podem ter
 * status mudado via Conferência da Viatura (S6b).
 */
@Injectable()
export class ViaturasService {
  constructor(
    private readonly mapaForca: MapaForcaCiodesService,
    private readonly prisma: PrismaService,
  ) {}

  async list(): Promise<Viatura[]> {
    const recursos = await this.mapaForca.getRecursos().catch(() => []);
    const fromMf = recursos
      .map((r) => viaturaFromRecurso(r))
      .filter((v): v is Viatura => v !== null);

    const overrides = await this.loadOverrides();

    const merged = new Map<string, Viatura>();
    for (const v of fromMf) merged.set(v.prefixo, v);
    for (const v of overrides.values()) {
      const baseDoMf = merged.get(v.prefixo);
      if (baseDoMf) {
        merged.set(v.prefixo, {
          ...baseDoMf,
          placa: v.placa ?? baseDoMf.placa,
          anoModelo: v.anoModelo ?? baseDoMf.anoModelo,
          composicaoFuncoes: v.composicaoFuncoes,
          observacoes: v.observacoes ?? baseDoMf.observacoes,
          kmAtual: v.kmAtual ?? baseDoMf.kmAtual,
          tipoCombustivel: v.tipoCombustivel ?? baseDoMf.tipoCombustivel,
          usaArla32: v.usaArla32 ?? baseDoMf.usaArla32,
          capacidadeTanqueLitros: v.capacidadeTanqueLitros ?? baseDoMf.capacidadeTanqueLitros,
          estadoTanquePercent: v.estadoTanquePercent ?? baseDoMf.estadoTanquePercent,
          alturaMetros: v.alturaMetros ?? baseDoMf.alturaMetros,
          larguraMetros: v.larguraMetros ?? baseDoMf.larguraMetros,
          militarResponsavelNf: v.militarResponsavelNf ?? baseDoMf.militarResponsavelNf,
          funcaoOperacional: v.funcaoOperacional ?? baseDoMf.funcaoOperacional,
          capacidadeTanqueArlaLitros:
            v.capacidadeTanqueArlaLitros ?? baseDoMf.capacidadeTanqueArlaLitros,
          observacoesDataDas: v.observacoesDataDas ?? baseDoMf.observacoesDataDas,
          historicoKm: v.historicoKm ?? baseDoMf.historicoKm,
          atualizadoEm: v.atualizadoEm,
        });
      } else {
        merged.set(v.prefixo, v);
      }
    }

    return [...merged.values()].sort((a, b) => a.prefixo.localeCompare(b.prefixo));
  }

  async findByPrefixo(prefixo: string): Promise<Viatura | undefined> {
    return (await this.list()).find((v) => v.prefixo === prefixo);
  }

  async findById(id: string): Promise<Viatura> {
    const all = await this.list();
    const found = all.find((v) => v.id === id);
    if (!found) throw new NotFoundException(`Viatura ${id} não encontrada`);
    return found;
  }

  async create(input: CreateViaturaInput): Promise<Viatura> {
    const existing = await this.findByPrefixo(input.prefixo);
    if (existing) {
      throw new ConflictException(`Viatura com prefixo "${input.prefixo}" já existe`);
    }
    const row = await this.prisma.viatura.create({
      data: viaturaCreateData(input),
    });
    return toViatura(row, 'override_admin');
  }

  /**
   * `registradoPorNf` é usado quando o admin edita `kmAtual` na tela de
   * detalhe — gera entrada em `historicoKm` (origem=`manual_admin`).
   */
  async update(id: string, input: UpdateViaturaInput, registradoPorNf?: string): Promise<Viatura> {
    const current = await this.findById(id);

    if (current.origem === 'mapa_forca') {
      if (input.status !== undefined && input.status !== current.status) {
        throw new BadRequestException(
          'Status de viatura gerenciada pelo Mapa Força só pode ser alterado via Conferência da Viatura (S6b).',
        );
      }
      if (input.prefixo !== undefined && input.prefixo !== current.prefixo) {
        throw new BadRequestException(
          'Prefixo de viatura gerenciada pelo Mapa Força não pode ser alterado.',
        );
      }
    }

    if (input.prefixo && input.prefixo !== current.prefixo) {
      const conflict = await this.findByPrefixo(input.prefixo);
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`Viatura com prefixo "${input.prefixo}" já existe`);
      }
    }
    const now = new Date().toISOString();

    const kmMudou =
      input.kmAtual !== undefined &&
      input.kmAtual !== current.kmAtual &&
      registradoPorNf !== undefined;
    const historicoKm: HistoricoKmEntry[] = kmMudou
      ? [
          ...(current.historicoKm ?? []),
          {
            kmRegistrado: input.kmAtual as number,
            registradoEm: now,
            registradoPorNf: registradoPorNf as string,
            origem: 'manual_admin' as const,
          },
        ]
      : (current.historicoKm ?? []);

    const merged: Viatura = {
      ...current,
      ...input,
      composicaoFuncoes: input.composicaoFuncoes ?? current.composicaoFuncoes,
      historicoKm,
      id: current.id,
      origem: current.origem,
      criadoEm: current.criadoEm,
      atualizadoEm: now,
    };
    await this.persistOverride(current.prefixo, merged);
    return merged;
  }

  /**
   * S0.x — Upsert por prefixo: usado pela tela de detalhe QDV quando a
   * viatura listada (QDV) ainda não tem override interno.
   */
  async upsertByPrefixo(
    prefixo: string,
    input: UpdateViaturaInput,
    registradoPorNf?: string,
  ): Promise<Viatura> {
    const existing = await this.findByPrefixo(prefixo);
    if (existing) return this.update(existing.id, input, registradoPorNf);

    const now = new Date().toISOString();
    const historicoKm: HistoricoKmEntry[] =
      input.kmAtual !== undefined && registradoPorNf !== undefined
        ? [
            {
              kmRegistrado: input.kmAtual,
              registradoEm: now,
              registradoPorNf,
              origem: 'manual_admin' as const,
            },
          ]
        : [];
    const row = await this.prisma.viatura.create({
      data: {
        prefixo,
        tipo: input.tipo ?? tipoFromPrefixo(prefixo),
        status: input.status ?? 'DISPONIVEL',
        origem: 'override_admin',
        composicaoFuncoes: input.composicaoFuncoes ?? [],
        placa: input.placa,
        anoModelo: input.anoModelo,
        funcaoOperacional: input.funcaoOperacional,
        observacoes: input.observacoes,
        kmAtual: input.kmAtual,
        tipoCombustivel: input.tipoCombustivel,
        usaArla32: input.usaArla32,
        capacidadeTanqueLitros: input.capacidadeTanqueLitros,
        capacidadeTanqueArlaLitros: input.capacidadeTanqueArlaLitros,
        estadoTanquePercent: input.estadoTanquePercent,
        alturaMetros: input.alturaMetros,
        larguraMetros: input.larguraMetros,
        militarResponsavelNf: input.militarResponsavelNf,
        historicoKm: historicoKm as unknown as object,
        observacoesDataDas: [] as unknown as object,
      },
    });
    return toViatura(row, 'override_admin');
  }

  /** Soft delete: muda status para BAIXADA. Bloqueado para origem=mapa_forca. */
  async softDelete(id: string): Promise<Viatura> {
    const current = await this.findById(id);
    if (current.origem === 'mapa_forca') {
      throw new BadRequestException(
        'Viatura gerenciada pelo Mapa Força não pode ser baixada manualmente.',
      );
    }
    return this.update(id, { status: 'BAIXADA' });
  }

  /**
   * S6b/F4 + S0.x/fixes-3 — "porta autorizada" da Conferência da Viatura.
   */
  async aplicarConferencia(
    prefixo: string,
    input: UpsertConferenciaViaturaInput,
    registradoPorNf: string,
    isAdmin = false,
  ): Promise<Viatura> {
    const current = await this.findByPrefixo(prefixo);
    if (!current) {
      throw new NotFoundException(`Viatura com prefixo "${prefixo}" não encontrada`);
    }
    if (input.statusMudanca === 'BAIXADA' && !input.motivoBaixa) {
      throw new BadRequestException('motivoBaixa é obrigatório quando statusMudanca=BAIXADA.');
    }

    const ultimoKm = (current.historicoKm ?? []).reduce(
      (acc, h) => Math.max(acc, h.kmRegistrado),
      current.kmAtual ?? 0,
    );
    const novoKm = input.kmAtual;
    let origemKm: 'conferencia' | 'manual_admin' = 'conferencia';
    if (novoKm !== undefined && novoKm < ultimoKm) {
      if (!isAdmin) {
        throw new BadRequestException(
          `KM informado (${novoKm}) é menor que o último registrado (${ultimoKm}). ` +
            `Apenas admin pode forçar decremento, e exige observação obrigatória.`,
        );
      }
      if (!input.observacao || !input.observacao.trim()) {
        throw new BadRequestException(
          `Decremento de KM (${novoKm} < ${ultimoKm}) exige observação obrigatória do admin.`,
        );
      }
      origemKm = 'manual_admin';
    }

    const now = new Date().toISOString();
    const novaObservacao = input.observacao
      ? [
          ...(current.observacoesDataDas ?? []),
          { texto: input.observacao, data: now, registradoPorNf },
        ]
      : (current.observacoesDataDas ?? []);

    const kmMudou = novoKm !== undefined && novoKm !== current.kmAtual;
    const historicoKm: HistoricoKmEntry[] = kmMudou
      ? [
          ...(current.historicoKm ?? []),
          {
            kmRegistrado: novoKm,
            registradoEm: now,
            registradoPorNf,
            origem: origemKm,
          },
        ]
      : (current.historicoKm ?? []);

    const updated: Viatura = {
      ...current,
      kmAtual: input.kmAtual ?? current.kmAtual,
      estadoTanquePercent: input.estadoTanquePercent,
      status: input.statusMudanca ?? current.status,
      observacoesDataDas: novaObservacao,
      historicoKm,
      atualizadoEm: now,
    };
    await this.persistOverride(updated.prefixo, updated);
    return updated;
  }

  // ── helpers privados ──────────────────────────────────────────────

  private async loadOverrides(): Promise<Map<string, Viatura>> {
    try {
      const rows = await this.prisma.viatura.findMany({ where: { deletedAt: null } });
      return new Map(rows.map((r) => [r.prefixo, toViatura(r, r.origem as Viatura['origem'])]));
    } catch {
      // Banco indisponível — sem overrides, lista do MF segue. Falhamos open
      // para não derrubar a tela em queda transiente do Postgres.
      return new Map();
    }
  }

  /** Persiste o override completo via upsert por prefixo. */
  private async persistOverride(prefixoAnterior: string, v: Viatura): Promise<void> {
    // Se o prefixo mudou (raro, só admin pode em override_admin), apaga o antigo.
    if (prefixoAnterior !== v.prefixo) {
      await this.prisma.viatura
        .delete({ where: { prefixo: prefixoAnterior } })
        .catch(() => undefined);
    }
    await this.prisma.viatura.upsert({
      where: { prefixo: v.prefixo },
      create: {
        prefixo: v.prefixo,
        placa: v.placa,
        tipo: v.tipo,
        funcaoOperacional: v.funcaoOperacional,
        anoModelo: v.anoModelo,
        status: v.status,
        origem: v.origem,
        composicaoFuncoes: v.composicaoFuncoes,
        observacoes: v.observacoes,
        kmAtual: v.kmAtual,
        tipoCombustivel: v.tipoCombustivel,
        usaArla32: v.usaArla32,
        capacidadeTanqueLitros: v.capacidadeTanqueLitros,
        capacidadeTanqueArlaLitros: v.capacidadeTanqueArlaLitros,
        estadoTanquePercent: v.estadoTanquePercent,
        alturaMetros: v.alturaMetros,
        larguraMetros: v.larguraMetros,
        militarResponsavelNf: v.militarResponsavelNf,
        historicoKm: (v.historicoKm ?? []) as unknown as object,
        observacoesDataDas: (v.observacoesDataDas ?? []) as unknown as object,
      },
      update: {
        placa: v.placa,
        tipo: v.tipo,
        funcaoOperacional: v.funcaoOperacional,
        anoModelo: v.anoModelo,
        status: v.status,
        composicaoFuncoes: v.composicaoFuncoes,
        observacoes: v.observacoes,
        kmAtual: v.kmAtual,
        tipoCombustivel: v.tipoCombustivel,
        usaArla32: v.usaArla32,
        capacidadeTanqueLitros: v.capacidadeTanqueLitros,
        capacidadeTanqueArlaLitros: v.capacidadeTanqueArlaLitros,
        estadoTanquePercent: v.estadoTanquePercent,
        alturaMetros: v.alturaMetros,
        larguraMetros: v.larguraMetros,
        militarResponsavelNf: v.militarResponsavelNf,
        historicoKm: (v.historicoKm ?? []) as unknown as object,
        observacoesDataDas: (v.observacoesDataDas ?? []) as unknown as object,
      },
    });
  }
}

function viaturaCreateData(input: CreateViaturaInput) {
  return {
    prefixo: input.prefixo,
    placa: input.placa,
    tipo: input.tipo,
    funcaoOperacional: input.funcaoOperacional,
    anoModelo: input.anoModelo,
    status: input.status,
    origem: 'override_admin',
    composicaoFuncoes: input.composicaoFuncoes ?? [],
    observacoes: input.observacoes,
    kmAtual: input.kmAtual,
    tipoCombustivel: input.tipoCombustivel,
    usaArla32: input.usaArla32,
    capacidadeTanqueLitros: input.capacidadeTanqueLitros,
    capacidadeTanqueArlaLitros: input.capacidadeTanqueArlaLitros,
    alturaMetros: input.alturaMetros,
    larguraMetros: input.larguraMetros,
    militarResponsavelNf: input.militarResponsavelNf,
    historicoKm: [] as unknown as object,
    observacoesDataDas: [] as unknown as object,
  };
}

function toViatura(r: PrismaViatura, origem: Viatura['origem']): Viatura {
  return {
    id: r.id,
    prefixo: r.prefixo,
    placa: r.placa ?? undefined,
    tipo: (r.tipo as TipoViatura) ?? 'AU',
    funcaoOperacional: r.funcaoOperacional ?? undefined,
    anoModelo: r.anoModelo ?? undefined,
    status: (r.status as StatusViatura) ?? 'DISPONIVEL',
    origem,
    composicaoFuncoes: (r.composicaoFuncoes ?? []) as Viatura['composicaoFuncoes'],
    observacoes: r.observacoes ?? undefined,
    kmAtual: r.kmAtual ?? undefined,
    tipoCombustivel: (r.tipoCombustivel as Viatura['tipoCombustivel']) ?? undefined,
    usaArla32: r.usaArla32 ?? undefined,
    capacidadeTanqueLitros: r.capacidadeTanqueLitros ?? undefined,
    capacidadeTanqueArlaLitros: r.capacidadeTanqueArlaLitros ?? undefined,
    estadoTanquePercent: r.estadoTanquePercent ?? undefined,
    alturaMetros: r.alturaMetros ?? undefined,
    larguraMetros: r.larguraMetros ?? undefined,
    militarResponsavelNf: r.militarResponsavelNf ?? undefined,
    historicoKm: (r.historicoKm as unknown as HistoricoKmEntry[]) ?? [],
    observacoesDataDas: (r.observacoesDataDas as unknown as Viatura['observacoesDataDas']) ?? [],
    criadoEm: r.criadoEm.toISOString(),
    atualizadoEm: r.atualizadoEm.toISOString(),
  };
}
