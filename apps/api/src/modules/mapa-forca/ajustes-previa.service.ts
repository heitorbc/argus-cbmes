import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import type {
  AddEscalaEspecialEmpenhoInput,
  AddTrocaEscalaEspecialInput,
  AjustesPrevia,
  EscalaEspecialAtoLight,
  EscalaEspecialEmpenho,
  StatusAprovacao,
  TrocaEscalaEspecial,
  UpsertAjustesPreviaInput,
} from '@argus/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ServicoService } from '../servico/servico.service';

/**
 * S2.10.7b — Tipo de item sujeito a aprovação individual pelo Fiscal.
 * Cada tipo usa um identificador estável distinto:
 *  - `troca`     → trocaId = `${substitutoNf ?? substitutoRaw}|${periodo}` (mesma dedup key)
 *  - `dispensa`  → dispensaId (UUID do cadastro)
 *  - `atestado`  → atestadoId (UUID do cadastro)
 */
export type TipoItemAprovavel = 'troca' | 'dispensa' | 'atestado';

/** S2.10.7b — Chave canônica do item no map de aprovações. */
function aprovacaoKey(tipo: TipoItemAprovavel, id: string): string {
  return `${tipo}:${id}`;
}

const VAZIO: AjustesPrevia = {
  trocas: [],
  escalaEspecial: {},
  notasServico: [],
  dispensas: [],
  trocasEscalaEspecial: [],
  empenhosEscalaEspecial: [],
  swapsMilitares: [],
  overridesMergulho: [],
  overridesParesRecursos: [],
  ativacoesRecurso: [],
  overridesChefeOperacoes: [],
};

/**
 * Persiste os ajustes pré-turno da Prévia (S5/F7a + S6a-fix item 4):
 * - Trocas pontuais de militares
 * - Escala especial (Matutina/Vespertina) — schema legado
 * - Notas de Serviço aplicáveis
 * - Dispensas do dia
 * - Trocas de Escala Especial (S6a-fix) — granularidade por ato
 *
 * Mock in-memory keyed por data ISO. Em S5b migra para Prisma.
 *
 * S6b: edições rejeitadas se o Serviço do dia já foi iniciado (read-only após
 * `Servico.iniciar()`). A menos que o usuário seja `admin` (que faz override).
 */
@Injectable()
export class AjustesPreviaService {
  private readonly byData: Map<string, AjustesPrevia> = new Map();

  constructor(
    @Inject(forwardRef(() => ServicoService))
    private readonly servico: ServicoService,
    private readonly prisma: PrismaService,
  ) {}

  get(dataIso: string): AjustesPrevia {
    return this.byData.get(dataIso) ?? VAZIO;
  }

  /**
   * S2.10.7c — Lê todas as decisões de aprovação do dia direto do Prisma.
   * Antes (S2.10.7b) era um Map in-memory; agora persiste em
   * `AprovacaoPreviaItem` para sobreviver a restart do Render.
   */
  async getAprovacoes(dataIso: string): Promise<ReadonlyMap<string, StatusAprovacao>> {
    const rows = await this.prisma.aprovacaoPreviaItem.findMany({
      where: { data: dataIso },
    });
    const map = new Map<string, StatusAprovacao>();
    for (const r of rows) {
      map.set(aprovacaoKey(r.tipo as TipoItemAprovavel, r.itemId), r.status as StatusAprovacao);
    }
    return map;
  }

  /**
   * S0.x/rename-mapa-forca — Edição da Prévia exige:
   *   - Estado do serviço em PREVIA_INICIADA
   *   - Usuário admin OU NF == previaIniciadaPorNf (quem clicou em "Iniciar Prévia")
   *
   * `nf` opcional para retrocompat com chamadas internas que não passam usuário;
   * nesse caso fallback para admin-only.
   */
  private ensureEditable(dataIso: string, nf: string | undefined, isAdmin: boolean): void {
    if (isAdmin) return;
    if (!nf || !this.servico.podeEditarAjustes(dataIso, nf, false)) {
      const estado = this.servico.get(dataIso).estado;
      if (estado === 'NAO_INICIADO') {
        throw new ForbiddenException(
          `Edição da Prévia de ${dataIso} bloqueada — clique em "Iniciar Prévia do Mapa Força" primeiro.`,
        );
      }
      if (estado === 'PREVIA_INICIADA') {
        throw new ForbiddenException(
          `Edição da Prévia de ${dataIso} restrita ao Fiscal que iniciou a Prévia (ou admin).`,
        );
      }
      throw new ForbiddenException(
        `Edição da Prévia de ${dataIso} bloqueada — serviço já iniciado. Use as Conferências e Alterações Diversas.`,
      );
    }
  }

  upsert(
    dataIso: string,
    input: UpsertAjustesPreviaInput,
    nf?: string,
    isAdmin = false,
  ): AjustesPrevia {
    this.ensureEditable(dataIso, nf, isAdmin);
    const ajustes: AjustesPrevia = {
      // S0.x/fixes-3 — Filtra trocas com `origemAutorizada=true` antes de
      // persistir. As trocas autorizadas vêm da planilha e são re-injetadas
      // a cada GET via `MapaForcaService` (`trocasAutComoPrevia`); persisti-las
      // aqui causaria duplicação a cada save.
      trocas: input.trocas.filter((t) => !t.origemAutorizada),
      escalaEspecial: input.escalaEspecial,
      notasServico: input.notasServico,
      dispensas: input.dispensas,
      // upsert preserva trocasEscalaEspecial existentes — o cliente gerencia via add/remove dedicados
      trocasEscalaEspecial:
        this.byData.get(dataIso)?.trocasEscalaEspecial ?? input.trocasEscalaEspecial,
      // S2.10.7b — empenhos gerenciados via add/remove dedicados (similar a trocasEscalaEspecial)
      empenhosEscalaEspecial:
        this.byData.get(dataIso)?.empenhosEscalaEspecial ?? input.empenhosEscalaEspecial ?? [],
      // S0.5 — cliente gerencia swapsMilitares via PUT inteiro (mesmo padrão de `trocas`).
      swapsMilitares: input.swapsMilitares,
      // S0.x/Fix-Mergulho — cliente gerencia overridesMergulho via PUT inteiro.
      overridesMergulho: input.overridesMergulho ?? [],
      // Override 01↔02 de pares operacionais (gerenciado pelo cliente).
      overridesParesRecursos: input.overridesParesRecursos ?? [],
      // S0.x/Fix-AtivarRecurso — cliente gerencia ativacoesRecurso via PUT inteiro.
      ativacoesRecurso: input.ativacoesRecurso ?? [],
      // S0.x/fixes-3 — Override do Chefe de Operações (modal dedicado).
      overridesChefeOperacoes: input.overridesChefeOperacoes ?? [],
    };
    this.byData.set(dataIso, ajustes);
    return ajustes;
  }

  /**
   * Adiciona uma troca de Escala Especial. Substitui se já existir uma troca
   * para o mesmo ato original (chave: `data|militarRaw|horario|funcao`).
   */
  addTrocaEscalaEspecial(
    dataIso: string,
    input: AddTrocaEscalaEspecialInput,
    registradoPorNf: string,
    isAdmin = false,
  ): TrocaEscalaEspecial {
    this.ensureEditable(dataIso, registradoPorNf, isAdmin);
    if (input.atoOriginal.data !== dataIso) {
      throw new BadRequestException(
        `Ato é do dia ${input.atoOriginal.data} mas troca está sendo registrada para ${dataIso}.`,
      );
    }
    const current: AjustesPrevia = this.byData.get(dataIso) ?? { ...VAZIO };
    const key = atoKey(input.atoOriginal);
    const filtered = current.trocasEscalaEspecial.filter((t) => atoKey(t.atoOriginal) !== key);
    const novaTroca: TrocaEscalaEspecial = {
      atoOriginal: input.atoOriginal,
      substituidoRaw: input.substituidoRaw,
      substituidoNf: input.substituidoNf,
      substitutoRaw: input.substitutoRaw,
      substitutoNf: input.substitutoNf,
      registradoEm: new Date().toISOString(),
      registradoPorNf,
    };
    const updated: AjustesPrevia = {
      ...current,
      trocasEscalaEspecial: [...filtered, novaTroca],
    };
    this.byData.set(dataIso, updated);
    return novaTroca;
  }

  /** Remove uma troca pelo identificador do ato original. */
  removeTrocaEscalaEspecial(
    dataIso: string,
    atoKeyEncoded: string,
    nf?: string,
    isAdmin = false,
  ): boolean {
    this.ensureEditable(dataIso, nf, isAdmin);
    const current = this.byData.get(dataIso);
    if (!current) return false;
    const before = current.trocasEscalaEspecial.length;
    const filtered = current.trocasEscalaEspecial.filter(
      (t) => atoKey(t.atoOriginal) !== atoKeyEncoded,
    );
    if (filtered.length === before) return false;
    this.byData.set(dataIso, { ...current, trocasEscalaEspecial: filtered });
    return true;
  }

  /**
   * S2.10.7b/c — Aprovação individual de um item da Prévia (troca, dispensa
   * ou atestado). Idempotente: re-emitir a mesma decisão atualiza apenas o
   * timestamp. Aplica o gate de edição da Prévia (PREVIA_INICIADA + Fiscal
   * escalado, ou admin).
   *
   * S2.10.7c — persistência em Prisma (antes Map in-memory).
   */
  async setAprovacaoItem(
    dataIso: string,
    tipo: TipoItemAprovavel,
    id: string,
    decisao: 'aprovar' | 'rejeitar',
    nf: string,
    isAdmin = false,
  ): Promise<StatusAprovacao> {
    this.ensureEditable(dataIso, nf, isAdmin);
    const status: StatusAprovacao = decisao === 'aprovar' ? 'aprovada' : 'rejeitada';
    await this.prisma.aprovacaoPreviaItem.upsert({
      where: { data_tipo_itemId: { data: dataIso, tipo, itemId: id } },
      create: {
        data: dataIso,
        tipo,
        itemId: id,
        status,
        decididoPorNf: nf,
      },
      update: {
        status,
        decididoPorNf: nf,
        decididoEm: new Date(),
      },
    });
    return status;
  }

  /**
   * S2.10.7b — Registra um empenho de Escala Especial. Substitui se já existir
   * empenho para o mesmo (ato|recursoAlvo|funcaoAlvo).
   */
  addEmpenhoEscalaEspecial(
    dataIso: string,
    input: AddEscalaEspecialEmpenhoInput,
    registradoPorNf: string,
    isAdmin = false,
  ): EscalaEspecialEmpenho {
    this.ensureEditable(dataIso, registradoPorNf, isAdmin);
    if (input.atoOriginal.data !== dataIso) {
      throw new BadRequestException(
        `Ato é do dia ${input.atoOriginal.data} mas empenho está sendo registrado para ${dataIso}.`,
      );
    }
    if (input.periodoFim <= input.periodoInicio) {
      throw new BadRequestException(
        `Período inválido: fim (${input.periodoFim}) deve ser maior que início (${input.periodoInicio}).`,
      );
    }
    const current: AjustesPrevia = this.byData.get(dataIso) ?? { ...VAZIO };
    const key = empenhoKey(input.atoOriginal, input.recursoAlvo, input.funcaoAlvo);
    const existentes = current.empenhosEscalaEspecial ?? [];
    const filtered = existentes.filter(
      (e) => empenhoKey(e.atoOriginal, e.recursoAlvo, e.funcaoAlvo) !== key,
    );
    const novoEmpenho: EscalaEspecialEmpenho = {
      atoOriginal: input.atoOriginal,
      recursoAlvo: input.recursoAlvo,
      funcaoAlvo: input.funcaoAlvo,
      periodoInicio: input.periodoInicio,
      periodoFim: input.periodoFim,
      substituidoNf: input.substituidoNf,
      substituidoRaw: input.substituidoRaw,
      destinoSubstituido: input.destinoSubstituido,
      registradoEm: new Date().toISOString(),
      registradoPorNf,
    };
    const updated: AjustesPrevia = {
      ...current,
      empenhosEscalaEspecial: [...filtered, novoEmpenho],
    };
    this.byData.set(dataIso, updated);
    return novoEmpenho;
  }

  /** S2.10.7b — Remove um empenho pelo identificador `ato|recurso|funcao`. */
  removeEmpenhoEscalaEspecial(
    dataIso: string,
    empenhoKeyEncoded: string,
    nf?: string,
    isAdmin = false,
  ): boolean {
    this.ensureEditable(dataIso, nf, isAdmin);
    const current = this.byData.get(dataIso);
    if (!current?.empenhosEscalaEspecial) return false;
    const before = current.empenhosEscalaEspecial.length;
    const filtered = current.empenhosEscalaEspecial.filter(
      (e) => empenhoKey(e.atoOriginal, e.recursoAlvo, e.funcaoAlvo) !== empenhoKeyEncoded,
    );
    if (filtered.length === before) return false;
    this.byData.set(dataIso, { ...current, empenhosEscalaEspecial: filtered });
    return true;
  }

  /**
   * S2.10.7c — reset agora limpa aprovações persistidas no Prisma também.
   */
  async reset(dataIso: string): Promise<void> {
    this.byData.delete(dataIso);
    await this.prisma.aprovacaoPreviaItem.deleteMany({ where: { data: dataIso } });
  }
}

/** Chave canônica para um ato da Escala Especial. Usada no lookup de trocas. */
export function atoKey(ato: EscalaEspecialAtoLight): string {
  return `${ato.data}|${ato.militarRaw}|${ato.horario}|${ato.funcao}`;
}

/**
 * S2.10.7b — Chave canônica para um empenho de Escala Especial. Combina ato +
 * recurso + função alvo (mesmo ato pode ter empenhos em recursos distintos).
 */
export function empenhoKey(
  ato: EscalaEspecialAtoLight,
  recursoAlvo: string,
  funcaoAlvo: string,
): string {
  return `${atoKey(ato)}|${recursoAlvo}|${funcaoAlvo}`;
}

/**
 * S2.10.7b — Identificador estável de uma troca derivada da planilha
 * (combina substituto + período, mesma chave usada na dedup).
 */
export function trocaApprovalId(input: {
  substitutoNf?: string;
  substitutoRaw: string;
  periodo: string;
}): string {
  const sub = input.substitutoNf ?? input.substitutoRaw.trim().toLowerCase();
  return `${sub}|${input.periodo}`;
}
