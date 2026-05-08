import { Module } from '@nestjs/common';
import { IdeoController } from './ideo.controller';
import { IdeoService } from './ideo.service';

@Module({
  controllers: [IdeoController],
  providers: [IdeoService],
  exports: [IdeoService],
})
export class IdeoModule {}
