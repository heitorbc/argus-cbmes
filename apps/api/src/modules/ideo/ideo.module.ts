import { Module } from '@nestjs/common';
import { IdeoChecklistService } from './ideo-checklist.service';
import { IdeoController } from './ideo.controller';
import { IdeoService } from './ideo.service';

@Module({
  controllers: [IdeoController],
  providers: [IdeoService, IdeoChecklistService],
  exports: [IdeoService, IdeoChecklistService],
})
export class IdeoModule {}
