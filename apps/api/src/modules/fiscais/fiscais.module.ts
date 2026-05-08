import { Module } from '@nestjs/common';
import { FiscaisController } from './fiscais.controller';
import { FiscaisService } from './fiscais.service';

@Module({
  controllers: [FiscaisController],
  providers: [FiscaisService],
  exports: [FiscaisService],
})
export class FiscaisModule {}
