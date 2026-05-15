import { forwardRef, Module } from '@nestjs/common';
import { MapaForcaModule } from '../mapa-forca/mapa-forca.module';
import { IdeoChecklistService } from './ideo-checklist.service';
import { IdeoStatusController } from './ideo-status.controller';
import { IdeoStatusService } from './ideo-status.service';
import { IdeoController } from './ideo.controller';
import { IdeoService } from './ideo.service';

@Module({
  imports: [forwardRef(() => MapaForcaModule)],
  controllers: [IdeoController, IdeoStatusController],
  providers: [IdeoService, IdeoChecklistService, IdeoStatusService],
  exports: [IdeoService, IdeoChecklistService, IdeoStatusService],
})
export class IdeoModule {}
