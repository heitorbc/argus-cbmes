import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateViaturaInput,
  RecursoMapaForca,
  StatusVtr,
  StatusViatura,
  TipoViatura,
  UpdateViaturaInput,
  UpsertConferenciaViaturaInput,
  Viatura,
} from '@argus/shared-types';
import { MapaForcaCiodesService } from '../mapa-forca-ciodes/mapa-forca-ciodes.service';

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

/**
 * S6a/ADR-009: nomenclatura interna agora espelha o MF (DISPONIVEL/BAIXADA/EMPRESTADA).
 * NAO_POSSUI vira `null` (recurso sem viatura).
 */
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
 * Source of truth: aba "1º BBM" do Mapa Força (via `MapaForcaCiodesService`).
 * Overrides locais ficam em memória (Fase 1) e sobrepõem por `prefixo`.
 *
 * S6a/ADR-009 — nova regra:
 * - Viaturas com `origem === 'mapa_forca'`: status só pode mudar via Conferência
 *   da Viatura (S6b). Tentativas via PUT comum retornam 400 com instrução clara.
 * - Campos novos (kmAtual, tipoCombustivel, ARLA32, dimensões, militar responsável)
 *   ficam em override local mesmo para viaturas do MF — esses dados não vêm da planilha.
 */
@Injectable()
export class ViaturasService {
  /** Storage in-memory de overrides (admin criou/editou). Key = prefixo. */
  private readonly overrides: Map<string, Viatura> = new Map();

  constructor(private readonly mapaForca: MapaForcaCiodesService) {}

  async list(): Promise<Viatura[]> {
    const recursos = await this.mapaForca.getRecursos().catch(() => []);
    const fromMf = recursos
      .map((r) => viaturaFromRecurso(r))
      .filter((v): v is Viatura => v !== null);

    // Aplica overrides por prefixo (admin venceu MF — mas para origem=mapa_forca
    // só substituímos campos auxiliares, mantendo `status` e `origem` do MF).
    const merged = new Map<string, Viatura>();
    for (const v of fromMf) merged.set(v.prefixo, v);
    for (const v of this.overrides.values()) {
      const baseDoMf = merged.get(v.prefixo);
      if (baseDoMf) {
        // É override sobre viatura do MF — preserva status/origem do MF, sobrescreve auxiliares
        merged.set(v.prefixo, {
          ...baseDoMf,
          // Auxiliares: kmAtual, tipoCombustivel, etc. vêm do override
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
    const now = new Date().toISOString();
    const viatura: Viatura = {
      ...input,
      id: randomUUID(),
      origem: 'override_admin',
      composicaoFuncoes: input.composicaoFuncoes ?? [],
      observacoesDataDas: [],
      historicoKm: [],
      criadoEm: now,
      atualizadoEm: now,
    };
    this.overrides.set(viatura.prefixo, viatura);
    return viatura;
  }

  /**
   * `registradoPorNf` é usado quando o admin edita `kmAtual` na tela de
   * detalhe — gera entrada em `historicoKm` (origem=`manual_admin`).
   * Opcional para chamadas internas legadas que não tocam KM.
   */
  async update(id: string, input: UpdateViaturaInput, registradoPorNf?: string): Promise<Viatura> {
    const current = await this.findById(id);

    // S6a/ADR-009 — viaturas do MF: bloqueia edição de status e prefixo
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

    // S0.x — histórico de KM: cresce quando kmAtual muda. Requer registradoPorNf;
    // sem ele a entrada não é criada (chamadas legadas continuam funcionando, mas
    // o admin sempre passa o NF via controller).
    const kmMudou =
      input.kmAtual !== undefined &&
      input.kmAtual !== current.kmAtual &&
      registradoPorNf !== undefined;
    const historicoKm = kmMudou
      ? [
          ...(current.historicoKm ?? []),
          {
            kmRegistrado: input.kmAtual as number,
            registradoEm: now,
            registradoPorNf: registradoPorNf as string,
            origem: 'manual_admin' as const,
          },
        ]
      : current.historicoKm;

    const updated: Viatura = {
      ...current,
      ...input,
      composicaoFuncoes: input.composicaoFuncoes ?? current.composicaoFuncoes,
      historicoKm,
      id: current.id,
      origem: current.origem, // não muda via update
      criadoEm: current.criadoEm,
      atualizadoEm: now,
    };
    // Override sempre por prefixo (mesmo para mapa_forca, guarda os campos extras)
    this.overrides.delete(current.prefixo);
    this.overrides.set(updated.prefixo, updated);
    return updated;
  }

  /**
   * S0.x — Upsert por prefixo: usado pela tela de detalhe QDV quando a
   * viatura listada (QDV) ainda não tem override interno. Cria override
   * inicial com defaults derivados (tipo a partir do prefixo, status
   * DISPONIVEL) ou atualiza o existente. Gera `historicoKm` na criação
   * se `kmAtual` for informado.
   */
  async upsertByPrefixo(
    prefixo: string,
    input: UpdateViaturaInput,
    registradoPorNf?: string,
  ): Promise<Viatura> {
    const existing = await this.findByPrefixo(prefixo);
    if (existing) return this.update(existing.id, input, registradoPorNf);

    const now = new Date().toISOString();
    const historicoKm =
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
    const created: Viatura = {
      id: randomUUID(),
      prefixo,
      tipo: input.tipo ?? tipoFromPrefixo(prefixo),
      status: input.status ?? 'DISPONIVEL',
      origem: 'override_admin',
      composicaoFuncoes: input.composicaoFuncoes ?? [],
      observacoesDataDas: [],
      historicoKm,
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
      criadoEm: now,
      atualizadoEm: now,
    };
    this.overrides.set(prefixo, created);
    return created;
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
   * S6b/F4 — "porta autorizada" da Conferência da Viatura.
   *
   * Bypassa o bloqueio do ADR-009 (status de viatura MF) — registrar mudanças
   * via Conferência é o caminho institucional correto. Adiciona observação
   * datada ao histórico e atualiza KM, tanque, e opcionalmente status.
   *
   * Se `statusMudanca='BAIXADA'`, exige `motivoBaixa`.
   */
  async aplicarConferencia(
    prefixo: string,
    input: UpsertConferenciaViaturaInput,
    registradoPorNf: string,
  ): Promise<Viatura> {
    const current = await this.findByPrefixo(prefixo);
    if (!current) {
      throw new NotFoundException(`Viatura com prefixo "${prefixo}" não encontrada`);
    }
    if (input.statusMudanca === 'BAIXADA' && !input.motivoBaixa) {
      throw new BadRequestException('motivoBaixa é obrigatório quando statusMudanca=BAIXADA.');
    }
    const now = new Date().toISOString();
    const novaObservacao = input.observacao
      ? [
          ...(current.observacoesDataDas ?? []),
          { texto: input.observacao, data: now, registradoPorNf },
        ]
      : current.observacoesDataDas;

    const updated: Viatura = {
      ...current,
      kmAtual: input.kmAtual ?? current.kmAtual,
      estadoTanquePercent: input.estadoTanquePercent,
      status: input.statusMudanca ?? current.status,
      observacoesDataDas: novaObservacao,
      atualizadoEm: now,
    };
    this.overrides.set(updated.prefixo, updated);
    return updated;
  }
}
