import { Controller, Get, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { MapaForcaCiodesService } from './mapa-forca-ciodes.service';

@Controller('mapa-forca-ciodes')
export class MapaForcaCiodesController {
  constructor(private readonly mapaForca: MapaForcaCiodesService) {}

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
