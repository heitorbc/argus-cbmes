import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { IseoHospitaisService } from './iseo-hospitais.service';
import type {
  IseoHospitalEntry,
  IseoHospitalSyncStatus,
  IseoHospitalUnidade,
} from '@argus/shared-types';

@Controller('iseo-hospitais')
export class IseoHospitaisController {
  constructor(private readonly svc: IseoHospitaisService) {}

  @Get()
  @Roles('admin', 'fiscal', 'sargenteante')
  async list(@Query('unidade') unidade?: string): Promise<IseoHospitalEntry[]> {
    if (unidade) {
      const u = this.parseUnidade(unidade);
      return this.svc.listByUnidade(u);
    }
    return this.svc.list();
  }

  @Get('dia/:data')
  @Roles('admin', 'fiscal', 'sargenteante')
  async listDoDia(@Param('data') data: string): Promise<IseoHospitalEntry[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    return this.svc.listDoDia(data);
  }

  @Get('militar/:nf')
  @Roles('admin', 'fiscal', 'sargenteante')
  async listByMilitar(@Param('nf') nf: string): Promise<IseoHospitalEntry[]> {
    if (!/^\d+$/.test(nf)) {
      throw new BadRequestException('nf inválida');
    }
    return this.svc.listByMilitar(nf);
  }

  @Get('sync-status')
  @Roles('admin', 'sargenteante')
  async getSyncStatus(): Promise<IseoHospitalSyncStatus[]> {
    return this.svc.getSyncStatus();
  }

  private parseUnidade(s: string): IseoHospitalUnidade {
    const up = s.toUpperCase();
    if (up === 'HPM' || up === 'HIMABA') return up;
    throw new BadRequestException('unidade inválida (use HPM ou HIMABA)');
  }
}
