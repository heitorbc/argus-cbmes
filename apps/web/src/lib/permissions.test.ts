import { describe, it, expect } from 'vitest';
import { canAccessRoute, canSeeSection } from './permissions';

describe('canSeeSection — S6f matriz papel × seção', () => {
  it('admin vê tudo', () => {
    const p = ['admin'];
    expect(canSeeSection(p, 'prontidao')).toBe(true);
    expect(canSeeSection(p, 'sargenteacao')).toBe(true);
    expect(canSeeSection(p, 'logistica')).toBe(true);
    expect(canSeeSection(p, 'configuracoes')).toBe(true);
  });

  it('sargenteante: Prontidão + Sargenteação', () => {
    const p = ['sargenteante'];
    expect(canSeeSection(p, 'prontidao')).toBe(true);
    expect(canSeeSection(p, 'sargenteacao')).toBe(true);
    expect(canSeeSection(p, 'logistica')).toBe(false);
    expect(canSeeSection(p, 'configuracoes')).toBe(false);
  });

  it('motorista: Prontidão + Logística', () => {
    const p = ['motorista'];
    expect(canSeeSection(p, 'prontidao')).toBe(true);
    expect(canSeeSection(p, 'sargenteacao')).toBe(false);
    expect(canSeeSection(p, 'logistica')).toBe(true);
    expect(canSeeSection(p, 'configuracoes')).toBe(false);
  });

  it('fiscal/chefe_equipe/operador/socorrista/cov/dro/sentinela/militar: só Prontidão', () => {
    for (const p of [
      'fiscal',
      'chefe_equipe',
      'operador',
      'socorrista',
      'cov',
      'dro',
      'sentinela',
      'militar',
    ]) {
      expect(canSeeSection([p], 'prontidao')).toBe(true);
      expect(canSeeSection([p], 'sargenteacao')).toBe(false);
      expect(canSeeSection([p], 'logistica')).toBe(false);
      expect(canSeeSection([p], 'configuracoes')).toBe(false);
    }
  });

  it('múltiplos papéis: união (sargenteante + motorista vê os dois extras)', () => {
    const p = ['sargenteante', 'motorista'];
    expect(canSeeSection(p, 'prontidao')).toBe(true);
    expect(canSeeSection(p, 'sargenteacao')).toBe(true);
    expect(canSeeSection(p, 'logistica')).toBe(true);
    expect(canSeeSection(p, 'configuracoes')).toBe(false);
  });

  it('papel desconhecido recebe só Prontidão', () => {
    expect(canSeeSection(['xpto'], 'prontidao')).toBe(true);
    expect(canSeeSection(['xpto'], 'sargenteacao')).toBe(false);
  });

  it('lista vazia de papéis = sem acesso', () => {
    expect(canSeeSection([], 'prontidao')).toBe(false);
    expect(canSeeSection([], 'sargenteacao')).toBe(false);
  });
});

describe('canAccessRoute — gate por URL', () => {
  it('rotas universais (não-mapeadas) sempre passam', () => {
    expect(canAccessRoute(['militar'], '/')).toBe(true);
    expect(canAccessRoute(['militar'], '/previa')).toBe(true);
    expect(canAccessRoute(['militar'], '/cadastros/fiscais')).toBe(true);
    expect(canAccessRoute(['militar'], '/cadastros/ideo')).toBe(true);
    expect(canAccessRoute(['militar'], '/servico/2026-05-09/conferencia-equipe')).toBe(true);
  });

  it('rotas de Sargenteação só para admin/sargenteante', () => {
    expect(canAccessRoute(['fiscal'], '/cadastros/efetivo')).toBe(false);
    expect(canAccessRoute(['motorista'], '/cadastros/escalas')).toBe(false);
    expect(canAccessRoute(['sargenteante'], '/cadastros/efetivo')).toBe(true);
    expect(canAccessRoute(['admin'], '/cadastros/escalas-especiais')).toBe(true);
  });

  it('rotas de Logística só para admin/motorista', () => {
    expect(canAccessRoute(['fiscal'], '/cadastros/viaturas')).toBe(false);
    expect(canAccessRoute(['sargenteante'], '/cadastros/viaturas')).toBe(false);
    expect(canAccessRoute(['motorista'], '/cadastros/viaturas')).toBe(true);
    expect(canAccessRoute(['admin'], '/cadastros/viaturas')).toBe(true);
  });

  it('rotas de Configurações só para admin', () => {
    expect(canAccessRoute(['sargenteante'], '/configuracoes/unidades')).toBe(false);
    expect(canAccessRoute(['motorista'], '/configuracoes/recursos')).toBe(false);
    expect(canAccessRoute(['admin'], '/configuracoes/unidades')).toBe(true);
    expect(canAccessRoute(['admin'], '/configuracoes/recursos')).toBe(true);
  });

  it('subrotas (/cadastros/efetivo/:nf) herdam permissão da rota mãe', () => {
    expect(canAccessRoute(['fiscal'], '/cadastros/efetivo/3037509')).toBe(false);
    expect(canAccessRoute(['sargenteante'], '/cadastros/efetivo/3037509')).toBe(true);
  });
});
