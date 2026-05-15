import { Controller, Get, Query } from '@nestjs/common';
import type { IncidenteBaon } from '@argus/shared-types';
import { IncidentesBaonService } from './incidentes-baon.service';

@Controller('incidentes-baon')
export class IncidentesBaonController {
  constructor(private readonly service: IncidentesBaonService) {}

  @Get()
  search(@Query('q') q?: string, @Query('limit') limit?: string): IncidenteBaon[] {
    const lim = limit ? Math.max(1, Math.min(50, Number.parseInt(limit, 10) || 20)) : 20;
    return this.service.search(q ?? '', lim);
  }
}
