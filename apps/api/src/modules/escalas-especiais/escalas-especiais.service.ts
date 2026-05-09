import { Injectable } from '@nestjs/common';
import type { EscalaEspecialMensal } from '@argus/shared-types';

interface EscalaKey {
  ano: number;
  mes: number;
}

function key(k: EscalaKey): string {
  return `${k.ano}-${String(k.mes).padStart(2, '0')}`;
}

/**
 * Mock service in-memory para Escalas Especiais (S6a).
 * Padrão idêntico a `EscalasService` (escala mensal). Em S5b migra para Prisma.
 */
@Injectable()
export class EscalasEspeciaisService {
  private readonly byMes = new Map<string, EscalaEspecialMensal>();

  list(): {
    escalas: {
      ano: number;
      mes: number;
      origemArquivo: string;
      importadoEm: string;
      totalAtos: number;
    }[];
  } {
    const escalas = [...this.byMes.values()]
      .map((e) => ({
        ano: e.ano,
        mes: e.mes,
        origemArquivo: e.origemArquivo,
        importadoEm: e.importadoEm,
        totalAtos: e.atos.length,
      }))
      .sort((a, b) => b.ano - a.ano || b.mes - a.mes);
    return { escalas };
  }

  get(ano: number, mes: number): EscalaEspecialMensal | null {
    return this.byMes.get(key({ ano, mes })) ?? null;
  }

  save(escala: EscalaEspecialMensal): EscalaEspecialMensal {
    this.byMes.set(key(escala), escala);
    return escala;
  }

  delete(ano: number, mes: number): boolean {
    return this.byMes.delete(key({ ano, mes }));
  }

  /** Atos especiais que ocorrem em uma data específica. Útil para Prévia (S6b). */
  getAtosDoDia(ano: number, mes: number, dataIso: string): EscalaEspecialMensal['atos'] {
    const escala = this.get(ano, mes);
    if (!escala) return [];
    return escala.atos.filter((a) => a.data === dataIso);
  }

  /** Reset usado nos tests. */
  reset(): void {
    this.byMes.clear();
  }
}
