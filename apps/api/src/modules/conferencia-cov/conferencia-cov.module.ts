import { Module } from '@nestjs/common';
import { ConferenciaCovController } from './conferencia-cov.controller';
import { ConferenciaCovService } from './conferencia-cov.service';

@Module({
  controllers: [ConferenciaCovController],
  providers: [ConferenciaCovService],
  exports: [ConferenciaCovService],
})
export class ConferenciaCovModule {}
