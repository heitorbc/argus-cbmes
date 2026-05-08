import { randomUUID } from 'node:crypto';
import type { Viatura } from '@argus/shared-types';

/**
 * Seed inicial das 13 viaturas da 1ª Cia/1º BBM (PRD §2.1.2).
 * Em S5 migra para Prisma; até lá, este mock é a fonte da verdade.
 */
export function buildInitialViaturas(now: () => Date = () => new Date()): Viatura[] {
  const ts = now().toISOString();
  const make = (
    prefixo: string,
    tipo: Viatura['tipo'],
    funcaoOperacional: string,
    composicao: Viatura['composicaoFuncoes'],
    status: Viatura['status'] = 'operacional',
    observacoes?: string,
  ): Viatura => ({
    id: randomUUID(),
    prefixo,
    tipo,
    funcaoOperacional,
    composicaoFuncoes: composicao,
    status,
    observacoes,
    criadoEm: ts,
    atualizadoEm: ts,
  });

  return [
    make('AU 154', 'AU', 'Viatura do Chefe de Operações', ['chefe', 'motorista']),
    make('ABTS 011', 'ABTS', 'Auto-Bomba Tanque-Salvamento (titular)', [
      'chefe',
      'motorista',
      'cov',
      'op1',
      'op2',
    ]),
    make(
      'ABTS 035',
      'ABTS',
      'ABTS reserva (em substituição ao 011)',
      ['chefe', 'motorista', 'cov', 'op1', 'op2'],
      'reserva',
    ),
    make('AR 044', 'AR', 'Auto-Resgate (APH)', ['chefe', 'motorista', 'socorrista']),
    make('AR 031', 'AR', 'Auto-Resgate (uso em ISEO TRT)', ['chefe', 'motorista', 'socorrista']),
    make('AU 169', 'AU', 'Apoio mergulho', ['motorista']),
    make('AM 002', 'AM', 'Embarcação de mergulho', ['chefe', 'mergulhador']),
    make('AM 003', 'AM', 'Embarcação de mergulho', ['chefe', 'mergulhador']),
    make('ATB 001', 'ATB', 'Auto-Tanque-Bomba', ['motorista']),
    make('AC 001', 'AC', 'Salvamar (praia)', ['chefe']),
    make(
      'TE 110',
      'TE',
      'Auto-Plataforma',
      ['chefe', 'motorista'],
      'baixada',
      'BAIXADA continuamente — equipe mantida na escala para substituição rápida',
    ),
    make('AU 302', 'AU', 'Administrativa para ISEO', ['motorista']),
    make('AU 133', 'AU', 'Administrativa para ISEO', ['motorista']),
  ];
}
