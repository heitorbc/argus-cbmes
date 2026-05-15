import {
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { ConferenciaViaturaEntry, UpsertConferenciaViaturaInput } from '@argus/shared-types';
import { ConferenciaEquipeService } from '../conferencia-equipe/conferencia-equipe.service';
import { MapaForcaService } from '../mapa-forca/mapa-forca.service';
import { ServicoService } from '../servico/servico.service';
import { ViaturasService } from '../viaturas/viaturas.service';

/**
 * Conferência da Viatura (S6b/F4 + S0.x).
 *
 * O Motorista escalado da viatura (ou o Chefe do recurso vinculado, ou
 * admin/fiscal/sargenteante) registra KM atual, estado do tanque,
 * observação, e opcionalmente muda o status. A operação:
 *   1. Atualiza a Viatura via `ViaturasService.aplicarConferencia()` (que
 *      bypassa o bloqueio ADR-009 — esta é a "porta" autorizada).
 *   2. Persiste a marcação por dataIso/vtrPrefixo.
 *   3. Se mudou status durante o serviço, registra `AlteracaoDiversa`
 *      (S6b/F6) — `ServicoService.addAlteracao` automaticamente marca
 *      o MF CIODES como dirty.
 *   4. Quando todas as viaturas DISPONIVEL/EMPRESTADA da composicaoMf
 *      forem conferidas, transiciona o Servico para `VIATURA_CONFERIDA`.
 */
@Injectable()
export class ConferenciaViaturaService {
  private readonly byData: Map<string, Map<string, ConferenciaViaturaEntry>> = new Map();

  constructor(
    private readonly servico: ServicoService,
    private readonly viaturas: ViaturasService,
    private readonly conferenciaEquipe: ConferenciaEquipeService,
    @Inject(forwardRef(() => MapaForcaService))
    private readonly mapaForca: MapaForcaService,
  ) {}

  getByData(dataIso: string): ConferenciaViaturaEntry[] {
    const m = this.byData.get(dataIso);
    return m ? Array.from(m.values()) : [];
  }

  /**
   * S0.x — Valida que o usuário pode conferir a viatura: motorista escalado
   * do recurso, chefe escalado do recurso, ou admin/fiscal/sargenteante override.
   */
  private async ensurePodeConferir(
    dataIso: string,
    vtrPrefixo: string,
    userNf: string,
    isOverride: boolean,
  ): Promise<void> {
    if (isOverride) return;
    // Recursos onde o usuário é chefe ou motorista no dia.
    const recursosUsuario = await this.mapaForca.recursosOndeMotoristaOuChefe(userNf, dataIso);
    // Identifica o recurso vinculado a esta viatura via funcaoOperacional.
    const viatura = await this.viaturas.findByPrefixo(vtrPrefixo);
    const recursoDaViatura = viatura?.funcaoOperacional;
    if (!recursoDaViatura || !recursosUsuario.includes(recursoDaViatura)) {
      throw new ForbiddenException(
        `Você não é Motorista nem Chefe escalado do recurso vinculado à viatura "${vtrPrefixo}". ` +
          `Apenas o Motorista escalado ou o Chefe do recurso podem realizar esta conferência ` +
          `(admin/fiscal/sargenteante podem fazer override).`,
      );
    }
  }

  async registrar(
    dataIso: string,
    vtrPrefixo: string,
    input: UpsertConferenciaViaturaInput,
    registradoPorNf: string,
    isOverride = false,
  ): Promise<ConferenciaViaturaEntry> {
    await this.ensurePodeConferir(dataIso, vtrPrefixo, registradoPorNf, isOverride);

    const viaturaAntes = await this.viaturas.findByPrefixo(vtrPrefixo);
    const statusAnterior = viaturaAntes?.status;

    // S6h/2.1 — Conferência de Viatura só libera depois que a equipe correspondente
    // foi conferida. Identifica a equipe pela `funcaoOperacional` da viatura
    // (que é o nome do recurso, ex.: "ABTS_01").
    const recurso = viaturaAntes?.funcaoOperacional;
    if (
      recurso &&
      this.servico.get(dataIso).estado !== 'NAO_INICIADO' &&
      !this.conferenciaEquipe.equipeConferida(dataIso, recurso)
    ) {
      throw new ConflictException(
        `Equipe "${recurso}" ainda não foi conferida — confira a equipe primeiro antes da viatura.`,
      );
    }

    await this.viaturas.aplicarConferencia(vtrPrefixo, { ...input, vtrPrefixo }, registradoPorNf);

    const now = new Date().toISOString();
    const entry: ConferenciaViaturaEntry = {
      ...input,
      vtrPrefixo,
      registradoEm: now,
      registradoPorNf,
    };

    const map = this.byData.get(dataIso) ?? new Map<string, ConferenciaViaturaEntry>();
    map.set(vtrPrefixo, entry);
    this.byData.set(dataIso, map);

    // Se status mudou durante o serviço, registra AlteracaoDiversa
    // (Servico.addAlteracao automaticamente marca MF dirty).
    if (
      input.statusMudanca &&
      statusAnterior &&
      input.statusMudanca !== statusAnterior &&
      this.servico.get(dataIso).estado !== 'NAO_INICIADO'
    ) {
      this.servico.addAlteracao(
        dataIso,
        {
          tipo: 'mudanca_viatura',
          vtrPrefixo,
          statusViaturaAnterior: statusAnterior,
          statusViaturaNovo: input.statusMudanca,
          motivo: input.motivoBaixa,
          observacao: input.observacao,
        },
        registradoPorNf,
      );
    }

    // S0.x — Auto-promote para VIATURA_CONFERIDA quando TODAS as viaturas
    // operacionais (DISPONIVEL/EMPRESTADA) do dia foram conferidas.
    await this.maybePromover(dataIso);

    return entry;
  }

  /**
   * Identifica o conjunto de viaturas que precisam ser conferidas:
   * `composicaoMf` filtrado por `vtrStatus IN (DISPONIVEL, EMPRESTADA)` e
   * com `vtrPrefixo` definido. Promove o Servico se todas têm entry.
   */
  private async maybePromover(dataIso: string): Promise<void> {
    const estado = this.servico.get(dataIso).estado;
    if (estado !== 'EQUIPE_CONFERIDA' && estado !== 'INICIADO') return;
    const payload = await this.mapaForca.getMapaForcaDoDia(dataIso);
    const viaturasParaConferir = payload.composicaoMf
      .filter(
        (c) =>
          c.vtrPrefixo &&
          (c.vtrStatus === 'DISPONIVEL' || c.vtrStatus === 'EMPRESTADA'),
      )
      .map((c) => c.vtrPrefixo as string);
    if (viaturasParaConferir.length === 0) return;
    const conferidas = this.byData.get(dataIso) ?? new Map();
    const todasConferidas = viaturasParaConferir.every((vtr) => conferidas.has(vtr));
    if (!todasConferidas) return;
    try {
      this.servico.marcarViaturaConferida(dataIso);
    } catch {
      // Idempotente — ignora se já promovido.
    }
  }

  reset(dataIso?: string): void {
    if (dataIso) this.byData.delete(dataIso);
    else this.byData.clear();
  }
}
