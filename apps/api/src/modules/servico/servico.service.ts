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

  /**
   * Indica se a UI deve renderizar a Prévia em modo SOMENTE LEITURA.
   * S0.x/rename-mapa-forca: a edição é liberada APENAS quando o serviço
   * está em PREVIA_INICIADA. Demais estados (NAO_INICIADO, INICIADO+) são
   * read-only — NAO_INICIADO porque o Fiscal ainda não abriu a Prévia;
   * INICIADO+ porque os ajustes pré-turno já foram congelados.
   */
  isReadOnly(dataIso: string): boolean {
    return this.get(dataIso).estado !== 'PREVIA_INICIADA';
  }

  /**
   * S0.x/rename-mapa-forca — Fiscal escalado (ou admin) abre a Prévia para
   * edição. Permission gate por NF é responsabilidade do caller (controller
   * recebe `nf` do `@CurrentUser`); aqui apenas verificamos `isAdminOrFiscal`
   * já validado pelo `iniciadoPorNf` esperado.
   *
   * Recebe `expectedFiscalNf` (o Fiscal escalado do dia, computado pelo
   * MapaForcaService). Aceita se `nf === expectedFiscalNf` ou se `isAdmin`.
   */
  iniciarPrevia(
    dataIso: string,
    nf: string,
    expectedFiscalNf: string | null,
    isAdmin: boolean,
  ): ServicoEstado {
    const current = this.get(dataIso);
    if (current.estado !== 'NAO_INICIADO') {
      throw new BadRequestException(
        `Prévia de ${dataIso} só pode ser iniciada a partir de NAO_INICIADO. Estado atual: "${current.estado}".`,
      );
    }
    if (!isAdmin && (expectedFiscalNf === null || nf !== expectedFiscalNf)) {
      throw new ForbiddenException(
        `Apenas o Fiscal escalado do dia ou admin podem iniciar a Prévia do Mapa Força.`,
      );
    }
    const updated: ServicoEstado = {
      ...current,
      estado: 'PREVIA_INICIADA',
      previaIniciadaEm: new Date().toISOString(),
      previaIniciadaPorNf: nf,
    };
    this.byData.set(dataIso, updated);
    return updated;
  }

  /**
   * S0.x/rename-mapa-forca — Cancelamento da Prévia. Volta o estado para
   * NAO_INICIADO. Permitido apenas para quem iniciou a Prévia ou admin.
   */
  cancelarPrevia(dataIso: string, nf: string, isAdmin: boolean): ServicoEstado {
    const current = this.get(dataIso);
    if (current.estado !== 'PREVIA_INICIADA') {
      throw new BadRequestException(
        `Cancelar Prévia só é possível a partir de PREVIA_INICIADA. Estado atual: "${current.estado}".`,
      );
    }
    if (!isAdmin && current.previaIniciadaPorNf !== nf) {
      throw new ForbiddenException(
        `Apenas quem iniciou a Prévia ou admin podem cancelá-la.`,
      );
    }
    const updated: ServicoEstado = {
      data: current.data,
      estado: 'NAO_INICIADO',
    };
    this.byData.set(dataIso, updated);
    return updated;
  }

  iniciar(dataIso: string, nf: string): ServicoEstado {
    const current = this.get(dataIso);
    if (current.estado !== 'PREVIA_INICIADA') {
      throw new BadRequestException(
        `Iniciar Serviço exige Prévia iniciada antes. Estado atual: "${current.estado}". ` +
          `Clique em "Iniciar Prévia do Mapa Força" primeiro.`,
      );
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

  /**
   * Indica se o usuário identificado pode editar os ajustes pré-turno
   * (`PUT /mapa-forca/:data/ajustes`). Edição requer:
   *   - Estado PREVIA_INICIADA
   *   - User é admin OU é quem iniciou a Prévia (`previaIniciadaPorNf`)
   */
  podeEditarAjustes(dataIso: string, nf: string, isAdmin: boolean): boolean {
    const estado = this.get(dataIso);
    if (estado.estado !== 'PREVIA_INICIADA') return false;
    if (isAdmin) return true;
    return estado.previaIniciadaPorNf === nf;
  }

  marcarEquipeConferida(dataIso: string): ServicoEstado {
    const current = this.get(dataIso);
    if (current.estado === 'NAO_INICIADO' || current.estado === 'PREVIA_INICIADA') {
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
    if (current.estado === 'NAO_INICIADO' || current.estado === 'PREVIA_INICIADA') {
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
   * S6h/2.1 — Marca início do preenchimento do MF (mock; transição
   * VIATURA_CONFERIDA → PREENCHENDO_MF). A escrita real do MF chega no S9.
   * Idempotente — chamadas repetidas mantêm timestamp.
   */
  marcarPreenchimentoMfIniciado(dataIso: string): ServicoEstado {
    const current = this.get(dataIso);
    if (current.estado !== 'VIATURA_CONFERIDA' && current.estado !== 'PREENCHENDO_MF') {
      throw new BadRequestException(
        `Preencher MF exige Conferência de Equipe + Viatura completas. Estado atual: "${current.estado}".`,
      );
    }
    const updated: ServicoEstado = {
      ...current,
      estado: 'PREENCHENDO_MF',
      preenchendoMfEm: current.preenchendoMfEm ?? new Date().toISOString(),
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
    if (current.estado === 'NAO_INICIADO' || current.estado === 'PREVIA_INICIADA') {
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
    const estado = this.get(dataIso).estado;
    if (estado === 'NAO_INICIADO' || estado === 'PREVIA_INICIADA') {
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
