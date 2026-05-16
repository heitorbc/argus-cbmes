import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeAll } from 'vitest';
import { Reflector } from '@nestjs/core';
import { EscalasEspeciaisController } from './escalas-especiais.controller';
import { EscalasEspeciaisService } from './escalas-especiais.service';
import { ServicoService } from '../servico/servico.service';

/**
 * Smoke test do `EscalasEspeciaisController` — garante que o módulo é instanciável
 * via NestJS DI e que os endpoints REST estão decorados como esperado.
 *
 * Esta cobertura previne regressões silenciosas como "Cannot POST /escalas-especiais/preview"
 * (S6a-fix item 1) que aconteceram quando o servidor foi mantido em build antiga.
 */
describe('EscalasEspeciaisController (smoke)', () => {
  let controller: EscalasEspeciaisController;
  let reflector: Reflector;

  beforeAll(async () => {
    // Tests não importam EscalasEspeciaisModule inteiro pra evitar a cadeia
    // de deps (Sheets-DB, ServicoModule → MapaForcaModule → AtestadosModule…).
    // Provê apenas o controller + service + mock de ServicoService.
    const moduleRef = await Test.createTestingModule({
      controllers: [EscalasEspeciaisController],
      providers: [
        EscalasEspeciaisService,
        {
          provide: ServicoService,
          useValue: { get: (data: string) => ({ data, estado: 'NAO_INICIADO' }) },
        },
      ],
    }).compile();
    controller = moduleRef.get(EscalasEspeciaisController);
    reflector = new Reflector();
  });

  it('módulo carrega e instancia o controller', () => {
    expect(controller).toBeInstanceOf(EscalasEspeciaisController);
  });

  it('controller usa prefix "escalas-especiais"', () => {
    const path = Reflect.getMetadata('path', EscalasEspeciaisController);
    expect(path).toBe('escalas-especiais');
  });

  it('expõe POST /preview', () => {
    const method = (controller as unknown as Record<string, unknown>).preview;
    expect(typeof method).toBe('function');
    const path = reflector.get<string>('path', method as object);
    const httpMethod = reflector.get<number>('method', method as object);
    expect(path).toBe('preview');
    // RequestMethod enum: 0=GET, 1=POST, 2=PUT, 3=DELETE...
    expect(httpMethod).toBe(1);
  });

  it('expõe POST /confirm', () => {
    const method = (controller as unknown as Record<string, unknown>).confirm;
    expect(typeof method).toBe('function');
    const path = reflector.get<string>('path', method as object);
    const httpMethod = reflector.get<number>('method', method as object);
    expect(path).toBe('confirm');
    expect(httpMethod).toBe(1);
  });

  it('expõe GET / (list)', () => {
    const method = (controller as unknown as Record<string, unknown>).list;
    expect(typeof method).toBe('function');
    const path = reflector.get<string>('path', method as object);
    const httpMethod = reflector.get<number>('method', method as object);
    expect(path).toBe('/');
    expect(httpMethod).toBe(0);
  });

  it('expõe DELETE /:ano/:mes', () => {
    const method = (controller as unknown as Record<string, unknown>).remove;
    expect(typeof method).toBe('function');
    const path = reflector.get<string>('path', method as object);
    const httpMethod = reflector.get<number>('method', method as object);
    expect(path).toBe(':ano/:mes');
    expect(httpMethod).toBe(3);
  });
});
