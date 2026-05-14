import { BadRequestException, ForbiddenException, forwardRef, Inject, Injectable } from '@nestjs/common';
import type {
  AddTrocaEscalaEspecialInput,
  AjustesPrevia,
  EscalaEspecialAtoLight,
  TrocaEscalaEspecial,
  UpsertAjustesPreviaInput,
} from '@argus/shared-types';
import { ServicoService } from '../servico/servico.service';

const VAZIO: AjustesPrevia = {
  trocas: [],
  escalaEspecial: {},
  notasServico: [],
  dispensas: [],
  trocasEscalaEspecial: [],
  swapsMilitares: [],
  overridesMergulho: [],
  overridesParesRecursos: [],
  ativacoesRecurso: [],
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
  ) {}

  get(dataIso: string): AjustesPrevia {
    return this.byData.get(dataIso) ?? VAZIO;
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
      trocas: input.trocas,
      escalaEspecial: input.escalaEspecial,
      notasServico: input.notasServico,
      dispensas: input.dispensas,
      // upsert preserva trocasEscalaEspecial existentes — o cliente gerencia via add/remove dedicados
      trocasEscalaEspecial:
        this.byData.get(dataIso)?.trocasEscalaEspecial ?? input.trocasEscalaEspecial,
      // S0.5 — cliente gerencia swapsMilitares via PUT inteiro (mesmo padrão de `trocas`).
      swapsMilitares: input.swapsMilitares,
      // S0.x/Fix-Mergulho — cliente gerencia overridesMergulho via PUT inteiro.
      overridesMergulho: input.overridesMergulho ?? [],
      // Override 01↔02 de pares operacionais (gerenciado pelo cliente).
      overridesParesRecursos: input.overridesParesRecursos ?? [],
      // S0.x/Fix-AtivarRecurso — cliente gerencia ativacoesRecurso via PUT inteiro.
      ativacoesRecurso: input.ativacoesRecurso ?? [],
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

  reset(dataIso: string): void {
    this.byData.delete(dataIso);
  }
}

/** Chave canônica para um ato da Escala Especial. Usada no lookup de trocas. */
export function atoKey(ato: EscalaEspecialAtoLight): string {
  return `${ato.data}|${ato.militarRaw}|${ato.horario}|${ato.funcao}`;
}
