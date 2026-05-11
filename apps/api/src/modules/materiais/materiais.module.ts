import { Module } from '@nestjs/common';
import { ViaturasModule } from '../viaturas/viaturas.module';
import { MateriaisController } from './materiais.controller';
import { MateriaisService } from './materiais.service';

@Module({
  imports: [ViaturasModule],
  controllers: [MateriaisController],
  providers: [MateriaisService],
  exports: [MateriaisService],
})
export class MateriaisModule {}
