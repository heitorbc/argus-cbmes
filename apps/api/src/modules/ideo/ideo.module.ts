import { Module } from '@nestjs/common';
import { IdeoChecklistService } from './ideo-checklist.service';
import { IdeoStatusController } from './ideo-status.controller';
import { IdeoStatusService } from './ideo-status.service';
import { IdeoController } from './ideo.controller';
import { IdeoService } from './ideo.service';

@Module({
  controllers: [IdeoController, IdeoStatusController],
  providers: [IdeoService, IdeoChecklistService, IdeoStatusService],
  exports: [IdeoService, IdeoChecklistService, IdeoStatusService],
})
export class IdeoModule {}
