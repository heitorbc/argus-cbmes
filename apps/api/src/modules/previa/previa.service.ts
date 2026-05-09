import { Injectable } from '@nestjs/common';
import {
  LETRA_EQUIPE_LABEL,
  TIPO_IDEO,
  type ComposicaoEntry,
  type Militar,
  type PreviaDoDia,
  type PreviaFiscal,
  type PreviaIdeoEntry,
  type PreviaInconsistencia,
  type PreviaTripulacaoEntry,
  type TipoIdeo,
} from '@argus/shared-types';
import { EfetivoService } from '../efetivo/efetivo.service';
import { EscalasService } from '../escalas/escalas.service';
import { FiscaisService } from '../fiscais/fiscais.service';
import { IdeoService } from '../ideo/ideo.service';
import { ViaturasService } from '../viaturas/viaturas.service';
import { NomeMatcher } from './nome-matching';

/**
 * Orquestra a geração da Prévia do Mapa Força para uma data.
 *
 * Fontes de leitura (todas Fase 1 mock in-memory exceto Efetivo+QDI que vêm via CSV público):
 *   - EscalasService: equipe escalada + composição (parsed XLSX, S3b)
 *   - EfetivoService (consolidado QDI+EFETIVO): resolução nome→NF (S2.5)
 *   - FiscaisService: cadastros override (S3a)
 *   - IdeoService: itens do dia por tipo (S3a)
 *   - ViaturasService: lista de viaturas operacionais (S2)
 *
 * Inconsistências detectadas (não bloqueiam — sinalizam para o Fiscal):
 *   - SEM_ESCALA_NO_MES, EQUIPE_NAO_ESCALADA_NO_DIA
 *   - NF_NAO_RESOLVIDO, AMBIGUIDADE_NOME (matching contra QDI)
 *   - FISCAL_SEM_NF_RESOLVIDO (Fiscal calculado mas QDI/EFETIVO não tem NF)
 *   - IDEO_NAO_CADASTRADO (dia/tipo sem entrada IDEO)
 *   - VIATURA_DESCONHECIDA (composição usa viatura que não está em ViaturasService)
 *
 * RF-MF-30x do PRD v2.0.
 */
@Injectable()
export class PreviaService {
  constructor(
    private readonly escalas: EscalasService,
    private readonly efetivo: EfetivoService,
    private readonly fiscais: FiscaisService,
    private readonly ideo: IdeoService,
    private readonly viaturas: ViaturasService,
  ) {}

  /**
   * Gera a Prévia do dia. Se a escala do mês não foi importada, retorna preview vazio com
   * inconsistência `SEM_ESCALA_NO_MES`. Se o dia não tem equipe escalada, retorna sem
   * tripulação com `EQUIPE_NAO_ESCALADA_NO_DIA`.
   */
  async getPreviaDoDia(dataIso: string): Promise<PreviaDoDia> {
    const [ano, mes, dia] = parseDataIso(dataIso);
    const inconsistencias: PreviaInconsistencia[] = [];

    const escala = this.escalas.get(ano, mes);
    if (!escala) {
      inconsistencias.push({
        tipo: 'SEM_ESCALA_NO_MES',
        mensagem: `Não há escala importada para ${String(mes).padStart(2, '0')}/${ano}. Importe o XLSX em /cadastros/escalas.`,
      });
    }

    const escalados = this.escalas.getEscaladosDoDia(ano, mes, dataIso);
    const equipe = escalados.equipe;
    if (escala && !equipe) {
      inconsistencias.push({
        tipo: 'EQUIPE_NAO_ESCALADA_NO_DIA',
        mensagem: `Não há equipe escalada para ${dataIso} no XLSX importado.`,
      });
    }

    // Resolução nome→NF cruzando com efetivo consolidado (apenas 1ª Cia).
    const efetivoTotal = await this.efetivo.getAll({ somente1aCia: true });
    const matcher = new NomeMatcher(efetivoTotal);

    const tripulacao: PreviaTripulacaoEntry[] = escalados.entries.map((entry) =>
      this.buildTripulacaoEntry(entry, matcher, inconsistencias),
    );

    // Cálculo do Fiscal (cadastrado → default por menor ANT).
    const fiscal = equipe
      ? this.calcularFiscal(equipe, dataIso, tripulacao, efetivoTotal, inconsistencias)
      : null;

    // Marca o Fiscal nas linhas da tripulação.
    if (fiscal?.militarResolvido) {
      const fiscalNf = fiscal.militarResolvido.nf;
      for (const t of tripulacao) {
        if (t.militarResolvido?.nf === fiscalNf) t.isFiscal = true;
      }
    }

    // IDEO do dia, agrupado por tipo.
    const ideoEntries: PreviaIdeoEntry[] = [];
    for (const tipo of TIPO_IDEO) {
      const found = this.ideo.get(dia, tipo);
      if (!found) {
        inconsistencias.push({
          tipo: 'IDEO_NAO_CADASTRADO',
          mensagem: `IDEO ${tipo} não cadastrado para o dia ${dia}.`,
          detalhe: { dia, tipo },
        });
        continue;
      }
      ideoEntries.push({ tipo, itens: found.itens });
    }

    // Viaturas operacionais (status=operacional).
    const viaturasOp = this.viaturas
      .list()
      .filter((v) => v.status === 'operacional')
      .map((v) => ({ id: v.id, codigo: v.prefixo, descricao: v.funcaoOperacional ?? v.tipo }));

    // Detecta viaturas referenciadas pela composição mas não conhecidas em ViaturasService.
    const viaturasReferidasNaEscala = new Set(
      tripulacao.map((t) => normalizeViaturaCode(t.viatura)).filter((s) => s.length > 0),
    );
    const viaturasConhecidas = new Set(viaturasOp.map((v) => normalizeViaturaCode(v.codigo)));
    for (const v of viaturasReferidasNaEscala) {
      if (!viaturasConhecidas.has(v)) {
        inconsistencias.push({
          tipo: 'VIATURA_DESCONHECIDA',
          mensagem: `A escala usa "${v}" que não está cadastrada como viatura operacional.`,
          detalhe: { viatura: v },
        });
      }
    }

    return {
      data: dataIso,
      ano,
      mes,
      dia,
      equipe,
      equipeNome: equipe ? LETRA_EQUIPE_LABEL[equipe] : null,
      fiscal,
      tripulacao,
      ideo: ideoEntries,
      viaturasOperacionais: viaturasOp,
      inconsistencias,
      origemEscala: escala?.origemArquivo ?? null,
      geradoEm: new Date().toISOString(),
    };
  }

  private buildTripulacaoEntry(
    entry: ComposicaoEntry,
    matcher: NomeMatcher,
    inconsistencias: PreviaInconsistencia[],
  ): PreviaTripulacaoEntry {
    const result = matcher.resolve(entry.militar);
    const resolved = result.resolved;
    if (!resolved) {
      inconsistencias.push({
        tipo: result.ambiguidade ? 'AMBIGUIDADE_NOME' : 'NF_NAO_RESOLVIDO',
        mensagem: result.ambiguidade
          ? `Ambiguidade ao resolver "${entry.militar.raw}" (${entry.equipe}/${entry.viatura}/${entry.funcao}) — múltiplos militares com este nome.`
          : `Não foi possível resolver NF de "${entry.militar.raw}" (${entry.equipe}/${entry.viatura}/${entry.funcao}).`,
        detalhe: {
          equipe: entry.equipe,
          viatura: entry.viatura,
          funcao: entry.funcao,
          raw: entry.militar.raw,
          postoAbreviado: entry.militar.postoAbreviado,
          nomeGuerra: entry.militar.nomeGuerra,
        },
      });
    }
    return {
      equipe: entry.equipe,
      viatura: entry.viatura,
      funcao: entry.funcao,
      militarRef: entry.militar,
      militarResolvido: resolved,
      isFiscal: false,
    };
  }

  private calcularFiscal(
    equipe: 'A' | 'B' | 'C' | 'D',
    dataIso: string,
    tripulacao: PreviaTripulacaoEntry[],
    efetivoTotal: readonly Militar[],
    inconsistencias: PreviaInconsistencia[],
  ): PreviaFiscal | null {
    const escaladosResolvidos = tripulacao
      .filter((t) => t.militarResolvido)
      .map((t) => ({ nf: t.militarResolvido!.nf, ant: t.militarResolvido!.ant }));

    const cadastrado = this.fiscais.getCadastradoVigente(equipe, dataIso);
    if (cadastrado) {
      const resolvido = efetivoTotal.find((m) => m.nf === cadastrado.militarNf) ?? null;
      if (!resolvido) {
        inconsistencias.push({
          tipo: 'FISCAL_SEM_NF_RESOLVIDO',
          mensagem: `Fiscal cadastrado NF ${cadastrado.militarNf} não foi encontrado no efetivo da 1ª Cia.`,
          detalhe: { fiscalId: cadastrado.id, militarNf: cadastrado.militarNf },
        });
      }
      return {
        militarNf: cadastrado.militarNf,
        militarResolvido: resolvido,
        origem: 'cadastrado',
        fiscalId: cadastrado.id,
        motivo: cadastrado.motivo,
      };
    }

    if (escaladosResolvidos.length === 0) return null;

    const escolhido = [...escaladosResolvidos].sort((a, b) => a.ant - b.ant)[0]!;
    const resolvido = efetivoTotal.find((m) => m.nf === escolhido.nf) ?? null;
    return {
      militarNf: escolhido.nf,
      militarResolvido: resolvido,
      origem: 'default',
    };
  }
}

function parseDataIso(dataIso: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataIso);
  if (!m) {
    throw new Error(`Data inválida: "${dataIso}". Esperado YYYY-MM-DD.`);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function normalizeViaturaCode(s: string): string {
  return s.trim().toUpperCase();
}

/** Re-export para uso em tests/controller. */
export { TIPO_IDEO, type TipoIdeo };
