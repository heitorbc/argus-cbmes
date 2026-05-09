import { Controller, Get, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { MapaForcaService } from './mapa-forca.service';

@Controller('mapa-forca')
export class MapaForcaController {
  constructor(private readonly mapaForca: MapaForcaService) {}

  /** Snapshot completo: recursos da 1ª Cia + Fiscal do dia + metadata. */
  @Get('snapshot')
  snapshot() {
    return this.mapaForca.getSnapshot();
  }

  /** Atalho: só os recursos. */
  @Get('recursos')
  recursos() {
    return this.mapaForca.getRecursos();
  }

  /** Força resync (admin/sargenteante). */
  @Roles('admin', 'sargenteante')
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync() {
    return this.mapaForca.forceSync();
  }
}
