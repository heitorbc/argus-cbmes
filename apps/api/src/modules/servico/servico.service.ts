import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  type AddAlteracaoDiversaInput,
  type AlteracaoDiversa,
  type EstadoServico,
  type ServicoEstado,
} from '@argus/shared-types';

const DEFAULT_ESTADO: EstadoServico = 'NAO_INICIADO';

/**
 * Estado do Serviço por dia (S6b).
 *
 * Mock in-memory keyed por `dataIso`. Em S5b migra para Prisma.
 *
 * Transições controladas centralmente — qualquer leitor (frontend ou outro
 * service) que precise saber se a Prévia está em modo read-only deve
 * consultar `isReadOnly(dataIso)`.
 */
@Injectable()
export class ServicoService {
  private readonly byData: Map<string, ServicoEstado> = new Map();
  private readonly alteracoesByData: Map<string, AlteracaoDiversa[]> = new Map();

  get(dataIso: string): ServicoEstado {
    return this.byData.get(dataIso) ?? { data: dataIso, estado: DEFAULT_ESTADO };
  }

  isReadOnly(dataIso: string): boolean {
    return this.get(dataIso).estado !== DEFAULT_ESTADO;
  }

  iniciar(dataIso: string, nf: string): ServicoEstado {
    const current = this.get(dataIso);
    if (current.estado !== 'NAO_INICIADO') {
      throw new BadRequestException(`Serviço de ${dataIso} já está em estado "${current.estado}".`);
    }
    const updated: ServicoEstado = {
      ...current,
      estado: 'INICIADO',
      iniciadoEm: new Date().toISOString(),
      iniciadoPorNf: nf,
    };
    this.byData.set(dataIso, updated);
    return updated;
  }

  marcarEquipeConferida(dataIso: string): ServicoEstado {
    const current = this.get(dataIso);
    if (current.estado === 'NAO_INICIADO') {
      throw new BadRequestException(
        `Serviço de ${dataIso} ainda não foi iniciado — não pode marcar equipe conferida.`,
      );
    }
    if (current.estado === 'ENCERRADO') {
      throw new BadRequestException(`Serviço de ${dataIso} já está encerrado.`);
    }
    // Idempotente: se já marcou, mantém timestamp
    const updated: ServicoEstado = {
      ...current,
      estado: current.estado === 'INICIADO' ? 'EQUIPE_CONFERIDA' : current.estado,
      conferenciaEquipeEm: current.conferenciaEquipeEm ?? new Date().toISOString(),
    };
    this.byData.set(dataIso, updated);
    return updated;
  }

  marcarViaturaConferida(dataIso: string): ServicoEstado {
    const current = this.get(dataIso);
    if (current.estado === 'NAO_INICIADO') {
      throw new BadRequestException(
        `Serviço de ${dataIso} ainda não foi iniciado — não pode marcar viaturas conferidas.`,
      );
    }
    if (current.estado === 'ENCERRADO') {
      throw new BadRequestException(`Serviço de ${dataIso} já está encerrado.`);
    }
    // Idempotente: se já marcou, mantém timestamp
    const novoEstado: EstadoServico =
      current.estado === 'EQUIPE_CONFERIDA'
        ? 'VIATURA_CONFERIDA'
        : current.estado === 'INICIADO'
          ? current.estado // ainda falta equipe — não promove
          : current.estado;
    const updated: ServicoEstado = {
      ...current,
      estado: novoEstado,
      conferenciaViaturaEm: current.conferenciaViaturaEm ?? new Date().toISOString(),
    };
    this.byData.set(dataIso, updated);
    return updated;
  }

  /**
   * Encerra o serviço. Em fluxo normal exige passar por VIATURA_CONFERIDA.
   * Override permitido apenas para admin/sargenteante (`force=true`).
   */
  encerrar(dataIso: string, nf: string, force = false): ServicoEstado {
    const current = this.get(dataIso);
    if (current.estado === 'NAO_INICIADO') {
      throw new BadRequestException(
        `Serviço de ${dataIso} ainda não foi iniciado — não pode encerrar.`,
      );
    }
    if (current.estado === 'ENCERRADO') {
      throw new BadRequestException(`Serviço de ${dataIso} já está encerrado.`);
    }
    if (!force && current.estado !== 'VIATURA_CONFERIDA' && current.estado !== 'PREENCHENDO_MF') {
      throw new ForbiddenException(
        `Encerrar exige conferência de equipe + viatura completas. Estado atual: "${current.estado}". Apenas admin pode forçar encerramento.`,
      );
    }
    const updated: ServicoEstado = {
      ...current,
      estado: 'ENCERRADO',
      encerradoEm: new Date().toISOString(),
      encerradoPorNf: nf,
    };
    this.byData.set(dataIso, updated);
    return updated;
  }

  // ── Alterações Diversas (S6b/F6) ────────────────────────────────────────

  addAlteracao(
    dataIso: string,
    input: AddAlteracaoDiversaInput,
    registradoPorNf: string,
  ): AlteracaoDiversa {
    if (this.get(dataIso).estado === 'NAO_INICIADO') {
      throw new BadRequestException(
        `Não é possível registrar alteração diversa antes de iniciar o serviço de ${dataIso}.`,
      );
    }
    const novaAlt: AlteracaoDiversa = {
      ...input,
      id: randomUUID(),
      data: dataIso,
      registradoEm: new Date().toISOString(),
      registradoPorNf,
    };
    const list = this.alteracoesByData.get(dataIso) ?? [];
    list.push(novaAlt);
    this.alteracoesByData.set(dataIso, list);
    return novaAlt;
  }

  listAlteracoes(dataIso: string): AlteracaoDiversa[] {
    return this.alteracoesByData.get(dataIso) ?? [];
  }

  // ── Test helpers ──────────────────────────────────────────────────────────

  reset(dataIso?: string): void {
    if (dataIso) {
      this.byData.delete(dataIso);
      this.alteracoesByData.delete(dataIso);
    } else {
      this.byData.clear();
      this.alteracoesByData.clear();
    }
  }
}
