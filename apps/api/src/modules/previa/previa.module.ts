import { Module } from '@nestjs/common';
import { AtestadosModule } from '../atestados/atestados.module';
import { ChefesOperacoesModule } from '../chefes-operacoes/chefes-operacoes.module';
import { DispensasModule } from '../dispensas/dispensas.module';
import { EfetivoModule } from '../efetivo/efetivo.module';
import { EscalasModule } from '../escalas/escalas.module';
import { EscalasEspeciaisModule } from '../escalas-especiais/escalas-especiais.module';
import { FiscaisModule } from '../fiscais/fiscais.module';
import { IdeoModule } from '../ideo/ideo.module';
import { ServicoModule } from '../servico/servico.module';
import { ViaturasModule } from '../viaturas/viaturas.module';
import { AjustesPreviaService } from './ajustes-previa.service';
import { PreviaController } from './previa.controller';
import { PreviaService } from './previa.service';

// S6g (2026-05-10) — `MapaForcaModule` e `RecursosModule` removidos dos imports:
// PreviaService não consome mais militares do MF nem categorias de Recurso
// (status de viatura vem indireto via ViaturasModule, que importa MapaForcaModule).
@Module({
  imports: [
    AtestadosModule,
    ChefesOperacoesModule,
    DispensasModule,
    EfetivoModule,
    EscalasModule,
    EscalasEspeciaisModule,
    FiscaisModule,
    IdeoModule,
    ServicoModule,
    ViaturasModule,
  ],
  controllers: [PreviaController],
  providers: [PreviaService, AjustesPreviaService],
  exports: [PreviaService, AjustesPreviaService],
})
export class PreviaModule {}
