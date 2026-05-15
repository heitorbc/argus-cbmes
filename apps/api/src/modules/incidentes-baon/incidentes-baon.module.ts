import { Module } from '@nestjs/common';
import { IncidentesBaonController } from './incidentes-baon.controller';
import { IncidentesBaonService } from './incidentes-baon.service';

@Module({
  controllers: [IncidentesBaonController],
  providers: [IncidentesBaonService],
  exports: [IncidentesBaonService],
})
export class IncidentesBaonModule {}
