import { Module } from '@nestjs/common';
import { UnidadesModule } from '../unidades/unidades.module';
import { RecursosController } from './recursos.controller';
import { RecursosService } from './recursos.service';

@Module({
  imports: [UnidadesModule],
  controllers: [RecursosController],
  providers: [RecursosService],
  exports: [RecursosService],
})
export class RecursosModule {}
