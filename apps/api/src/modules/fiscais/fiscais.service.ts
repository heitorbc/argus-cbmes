import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CreateFiscalInput, FiscalCadastrado, FiscalVigente } from '@argus/shared-types';

/**
 * Cadastro de Fiscais de Serviço explicitamente designados.
 *
 * - Admin cadastra um Fiscal sobrescrevendo o cálculo automático.
 * - `getVigente(equipe, data)` prioriza cadastro explícito; se não houver, retorna `null`
 *   (caller deve aplicar o cálculo default — menor ANT na equipe escalada).
 *
 * In-memory (Fase 1); migra para Prisma+Supabase em S5.
 *
 * RF-CM-103 do PRD v2.0.
 */
@Injectable()
export class FiscaisService {
  private readonly fiscais: Map<string, FiscalCadastrado> = new Map();

  list(): FiscalCadastrado[] {
    return Array.from(this.fiscais.values()).sort(
      (a, b) => b.vigenciaInicio.localeCompare(a.vigenciaInicio), // mais recentes primeiro
    );
  }

  findById(id: string): FiscalCadastrado {
    const f = this.fiscais.get(id);
    if (!f) throw new NotFoundException(`Fiscal cadastrado ${id} não encontrado`);
    return f;
  }

  create(input: CreateFiscalInput, criadoPorNf: string): FiscalCadastrado {
    const fiscal: FiscalCadastrado = {
      id: randomUUID(),
      militarNf: input.militarNf,
      equipe: input.equipe,
      vigenciaInicio: input.vigenciaInicio,
      vigenciaFim: input.vigenciaFim,
      motivo: input.motivo,
      criadoEm: new Date().toISOString(),
      criadoPorNf,
    };
    this.fiscais.set(fiscal.id, fiscal);
    return fiscal;
  }

  delete(id: string): void {
    if (!this.fiscais.has(id)) {
      throw new NotFoundException(`Fiscal cadastrado ${id} não encontrado`);
    }
    this.fiscais.delete(id);
  }

  /**
   * Retorna o Fiscal cadastrado vigente para uma equipe + data, ou null se não houver.
   * Critério de match:
   *   - data está em [vigenciaInicio, vigenciaFim] (vigenciaFim opcional → indefinido = sempre vigente)
   *   - equipe casa OU cadastro não tem equipe (curinga)
   *
   * Quando há múltiplos cadastros vigentes (ex.: um geral e outro específico), retorna o mais
   * específico (com `equipe` definida).
   */
  getCadastradoVigente(equipe: 'A' | 'B' | 'C' | 'D', data: string): FiscalCadastrado | null {
    const matches = this.list().filter((f) => {
      const inicioOk = data >= f.vigenciaInicio;
      const fimOk = !f.vigenciaFim || data <= f.vigenciaFim;
      const equipeOk = !f.equipe || f.equipe === equipe;
      return inicioOk && fimOk && equipeOk;
    });

    if (matches.length === 0) return null;
    // específico (com equipe) vence sobre genérico (sem equipe)
    return matches.sort((a, b) => {
      if (!!a.equipe === !!b.equipe) return b.vigenciaInicio.localeCompare(a.vigenciaInicio);
      return a.equipe ? -1 : 1;
    })[0]!;
  }

  /**
   * Aplica a regra completa: cadastro explícito → default (menor ANT entre os escalados).
   *
   * O `escalados` é a lista de NFs que estão escalados na equipe naquela data — vem do parser
   * de Escala XLSX (S3b). O caller também precisa fornecer um lookup de ANT por NF (do QDI).
   *
   * Retorna `null` se a equipe não tem militares escalados (caso edge — equipe vazia).
   */
  getVigente(
    equipe: 'A' | 'B' | 'C' | 'D',
    data: string,
    escalados: { nf: string; ant: number }[],
  ): FiscalVigente | null {
    const cadastrado = this.getCadastradoVigente(equipe, data);
    if (cadastrado) {
      return {
        militarNf: cadastrado.militarNf,
        origem: 'cadastrado',
        fiscalId: cadastrado.id,
      };
    }

    if (escalados.length === 0) return null;

    // default: menor ANT (mais antigo)
    const escolhido = [...escalados].sort((a, b) => a.ant - b.ant)[0]!;
    return {
      militarNf: escolhido.nf,
      origem: 'default',
    };
  }
}
