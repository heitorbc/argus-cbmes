import { Controller, Get, Param } from '@nestjs/common';
import { UnidadesService } from './unidades.service';

@Controller('unidades')
export class UnidadesController {
  constructor(private readonly unidades: UnidadesService) {}

  @Get()
  list() {
    return this.unidades.list();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.unidades.findById(id);
  }
}
