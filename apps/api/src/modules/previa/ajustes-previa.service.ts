import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
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

  constructor(private readonly servico: ServicoService) {}

  get(dataIso: string): AjustesPrevia {
    return this.byData.get(dataIso) ?? VAZIO;
  }

  private ensureEditable(dataIso: string, isAdmin: boolean): void {
    if (isAdmin) return;
    if (this.servico.isReadOnly(dataIso)) {
      throw new ForbiddenException(
        `Edição da Prévia de ${dataIso} bloqueada — serviço já iniciado. Use as Conferências e Alterações Diversas.`,
      );
    }
  }

  upsert(dataIso: string, input: UpsertAjustesPreviaInput, isAdmin = false): AjustesPrevia {
    this.ensureEditable(dataIso, isAdmin);
    const ajustes: AjustesPrevia = {
      trocas: input.trocas,
      escalaEspecial: input.escalaEspecial,
      notasServico: input.notasServico,
      dispensas: input.dispensas,
      // upsert preserva trocasEscalaEspecial existentes — o cliente gerencia via add/remove dedicados
      trocasEscalaEspecial:
        this.byData.get(dataIso)?.trocasEscalaEspecial ?? input.trocasEscalaEspecial,
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
    this.ensureEditable(dataIso, isAdmin);
    if (input.atoOriginal.data !== dataIso) {
      throw new BadRequestException(
        `Ato é do dia ${input.atoOriginal.data} mas troca está sendo registrada para ${dataIso}.`,
      );
    }
    const current = this.byData.get(dataIso) ?? { ...VAZIO };
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
  removeTrocaEscalaEspecial(dataIso: string, atoKeyEncoded: string, isAdmin = false): boolean {
    this.ensureEditable(dataIso, isAdmin);
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
