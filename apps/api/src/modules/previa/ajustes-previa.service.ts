import { Injectable } from '@nestjs/common';
import type { AjustesPrevia, UpsertAjustesPreviaInput } from '@argus/shared-types';

const VAZIO: AjustesPrevia = {
  trocas: [],
  escalaEspecial: {},
  notasServico: [],
  dispensas: [],
};

/**
 * Persiste os ajustes pré-turno da Prévia (S5/F7a):
 * - Trocas pontuais de militares
 * - Escala especial (Matutina/Vespertina)
 * - Notas de Serviço aplicáveis
 * - Dispensas do dia
 *
 * Mock in-memory keyed por data ISO. Em S5b migra para Prisma.
 */
@Injectable()
export class AjustesPreviaService {
  private readonly byData: Map<string, AjustesPrevia> = new Map();

  get(dataIso: string): AjustesPrevia {
    return this.byData.get(dataIso) ?? VAZIO;
  }

  upsert(dataIso: string, input: UpsertAjustesPreviaInput): AjustesPrevia {
    const ajustes: AjustesPrevia = {
      trocas: input.trocas,
      escalaEspecial: input.escalaEspecial,
      notasServico: input.notasServico,
      dispensas: input.dispensas,
    };
    this.byData.set(dataIso, ajustes);
    return ajustes;
  }

  reset(dataIso: string): void {
    this.byData.delete(dataIso);
  }
}
