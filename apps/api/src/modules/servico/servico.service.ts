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

    // S0.x — Passagem de serviço: ao iniciar o serviço de hoje, encerra
    // automaticamente os serviços anteriores ainda abertos (estado
    // INICIADO+ e diferente de ENCERRADO). Reflete a regra institucional
    // de que o serviço é ininterrupto e a passagem entre equipes a cada
    // 24h fecha o turno anterior.
    this.encerrarServicosAnteriores(dataIso, nf);

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
   * S0.x — Auto-finalização na passagem de serviço.
   *
   * Encerra todos os serviços anteriores a `dataAtual` que ainda estão em
   * estados de operação (INICIADO, EQUIPE_CONFERIDA, VIATURA_CONFERIDA,
   * PREENCHENDO_MF). Não toca em NAO_INICIADO, PREVIA_INICIADA (não eram
   * "serviço em andamento") nem ENCERRADO (idempotente).
   */
  private encerrarServicosAnteriores(dataAtual: string, nf: string): void {
    const now = new Date().toISOString();
    for (const [data, estado] of this.byData.entries()) {
      if (data >= dataAtual) continue;
      if (
        estado.estado === 'INICIADO' ||
        estado.estado === 'EQUIPE_CONFERIDA' ||
        estado.estado === 'VIATURA_CONFERIDA' ||
        estado.estado === 'PREENCHENDO_MF'
      ) {
        this.byData.set(data, {
          ...estado,
          estado: 'ENCERRADO',
          encerradoEm: now,
          encerradoPorNf: nf,
        });
      }
    }
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
   *
   * S0.x/dev-fixes — Aceita também `EQUIPE_CONFERIDA` como ponto de
   * partida: promove implicitamente para `VIATURA_CONFERIDA` quando o auto
   * detect (`maybePromover`) não disparou (ex.: composicaoMf sem viaturas
   * DISPONIVEL ou divergência de prefixo). Resolve cenários em que o
   * Fiscal concluiu todas as conferências visíveis mas o serviço ainda
   * não promoveu sozinho.
   */
  marcarPreenchimentoMfIniciado(dataIso: string): ServicoEstado {
    const current = this.get(dataIso);
    if (
      current.estado !== 'VIATURA_CONFERIDA' &&
      current.estado !== 'PREENCHENDO_MF' &&
      current.estado !== 'EQUIPE_CONFERIDA'
    ) {
      throw new BadRequestException(
        `Preencher MF exige Conferência de Equipe + Viatura completas. Estado atual: "${current.estado}".`,
      );
    }
    // Soft-promote EQUIPE_CONFERIDA → VIATURA_CONFERIDA antes de preencher.
    if (current.estado === 'EQUIPE_CONFERIDA') {
      this.byData.set(dataIso, {
        ...current,
        estado: 'VIATURA_CONFERIDA',
        conferenciaViaturaEm: current.conferenciaViaturaEm ?? new Date().toISOString(),
      });
    }
    const now = new Date().toISOString();
    const updated: ServicoEstado = {
      ...current,
      estado: 'PREENCHENDO_MF',
      preenchendoMfEm: current.preenchendoMfEm ?? now,
      // S0.x — Marca como sincronizado (limpa dirty + grava timestamp do
      // preenchimento). Próximas alterações estruturais reativam o botão.
      mfPreenchidoEm: now,
      mfDirtyDesde: undefined,
    };
    this.byData.set(dataIso, updated);
    return updated;
  }

  /**
   * S0.x — Atualizar Mapa Força CIODES (mock). Equivale a "preencher de
   * novo" — limpa dirty e atualiza timestamp. Estado precisa ser
   * PREENCHENDO_MF (já preencheu antes).
   */
  atualizarMfMock(dataIso: string): ServicoEstado {
    const current = this.get(dataIso);
    if (current.estado !== 'PREENCHENDO_MF') {
      throw new BadRequestException(
        `Atualizar MF exige estado PREENCHENDO_MF. Estado atual: "${current.estado}".`,
      );
    }
    const now = new Date().toISOString();
    const updated: ServicoEstado = {
      ...current,
      mfPreenchidoEm: now,
      mfDirtyDesde: undefined,
    };
    this.byData.set(dataIso, updated);
    return updated;
  }

  /**
   * S0.x — Marca o Mapa Força CIODES como dirty (precisa atualizar). Só
   * tem efeito quando o serviço já foi preenchido (estado PREENCHENDO_MF).
   * Idempotente — chamadas repetidas mantêm o timestamp original do
   * primeiro evento dirty.
   */
  marcarMfDirty(dataIso: string): void {
    const current = this.get(dataIso);
    if (current.estado !== 'PREENCHENDO_MF') return;
    if (current.mfDirtyDesde) return; // já dirty
    this.byData.set(dataIso, {
      ...current,
      mfDirtyDesde: new Date().toISOString(),
    });
  }

  /**
   * S0.x — Encerra o serviço **manualmente** (apenas admin).
   *
   * O fluxo institucional normal é a auto-finalização disparada pela
   * passagem de serviço (`iniciar` do dia D+1 encerra D). Esta operação
   * manual é um override administrativo para casos excepcionais (ex.:
   * dia sem passagem de serviço programada).
   */
  encerrar(dataIso: string, nf: string, isAdmin: boolean): ServicoEstado {
    const current = this.get(dataIso);
    if (!isAdmin) {
      throw new ForbiddenException(
        `Encerramento manual de serviço é restrito a admin. ` +
          `O fluxo normal é a passagem de serviço (Iniciar Serviço do próximo turno).`,
      );
    }
    if (current.estado === 'NAO_INICIADO' || current.estado === 'PREVIA_INICIADA') {
      throw new BadRequestException(
        `Serviço de ${dataIso} ainda não foi iniciado — não pode encerrar.`,
      );
    }
    if (current.estado === 'ENCERRADO') {
      throw new BadRequestException(`Serviço de ${dataIso} já está encerrado.`);
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

    // S0.x — Alterações estruturais marcam dirty (troca/mudança de viatura).
    // Observações puras não alteram MF CIODES.
    if (input.tipo === 'troca_militar' || input.tipo === 'mudanca_viatura') {
      this.marcarMfDirty(dataIso);
    }
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
