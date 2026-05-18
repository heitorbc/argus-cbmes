import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  registrarConferenciaCovInputSchema,
  type ConferenciaCov,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ConferenciaCovService } from './conferencia-cov.service';

@Controller('conferencia/cov')
export class ConferenciaCovController {
  constructor(private readonly service: ConferenciaCovService) {}

  @Get(':data/:vtrPrefixo')
  async get(
    @Param('data') data: string,
    @Param('vtrPrefixo') vtrPrefixo: string,
  ): Promise<ConferenciaCov | null> {
    return this.service.getByVtrEData(data, decodeURIComponent(vtrPrefixo));
  }

  @Put(':data/:vtrPrefixo')
  async registrar(
    @Param('data') data: string,
    @Param('vtrPrefixo') vtrPrefixo: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ): Promise<ConferenciaCov> {
    const parsed = registrarConferenciaCovInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.service.registrar(data, decodeURIComponent(vtrPrefixo), user.nf, parsed.data);
  }
}
