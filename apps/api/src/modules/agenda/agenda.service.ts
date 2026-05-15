import { Injectable, Logger } from '@nestjs/common';
import type {
  AgendaConflito,
  AgendaItem,
  AgendaResponse,
} from '@argus/shared-types';
import { MapaForcaService } from '../mapa-forca/mapa-forca.service';
import { NomeMatcher } from '../mapa-forca/nome-matching';
import { NotasServicoService } from '../notas-servico/notas-servico.service';
import { ChefesOperacoesService } from '../chefes-operacoes/chefes-operacoes.service';
import { IseoHospitaisService } from '../iseo-hospitais/iseo-hospitais.service';
import { AtestadosService } from '../atestados/atestados.service';
import { DispensasService } from '../dispensas/dispensas.service';
import { FeriasService } from '../ferias/ferias.service';
import { TrocasAutorizadasService } from '../trocas-autorizadas/trocas-autorizadas.service';
import { EscalasEspeciaisService } from '../escalas-especiais/escalas-especiais.service';
import { EfetivoService } from '../efetivo/efetivo.service';
import { parseMilitarCell } from '../escalas/escala-xlsx-parser';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  response: AgendaResponse;
  expiresAt: number;
}

const CONFLICT_PAIRS: Array<[string, string]> = [
  ['escala_mensal', 'iseo_hospitais'],
  ['escala_mensal', 'chefe_operacoes'],
  ['escala_mensal', 'nota_servico'],
  ['escala_mensal', 'atestado'],
  ['escala_mensal', 'dispensa'],
  ['escala_mensal', 'ferias'],
  ['iseo_hospitais', 'escala_especial'],
  ['iseo_hospitais', 'chefe_operacoes'],
  ['iseo_hospitais', 'atestado'],
  ['iseo_hospitais', 'dispensa'],
  ['iseo_hospitais', 'ferias'],
  ['chefe_operacoes', 'nota_servico'],
];

/**
 * Agrega as próximas escalas + ausências de um militar a partir de TODAS
 * as fontes operacionais, reusando o pipeline do `MapaForcaService` para
 * resolver nome→NF (via `NomeMatcher`).
 *
 * Cache leve por (nf, range) de 60s para evitar refetches em cliques
 * rápidos de toggle list/calendar.
 */
@Injectable()
export class AgendaService {
  private readonly logger = new Logger(AgendaService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly mapaForca: MapaForcaService,
    private readonly escalasEspeciais: EscalasEspeciaisService,
    private readonly notasServico: NotasServicoService,
    private readonly chefesOperacoes: ChefesOperacoesService,
    private readonly iseoHospitais: IseoHospitaisService,
    private readonly atestados: AtestadosService,
    private readonly dispensas: DispensasService,
    private readonly ferias: FeriasService,
    private readonly trocasAutorizadas: TrocasAutorizadasService,
    private readonly efetivo: EfetivoService,
  ) {}

  /**
   * Retorna a Agenda do militar identificado por `nf`. `nome` é opcional —
   * usado para casar trocas autorizadas (que armazenam só o nome do militar).
   */
  async forMilitar(
    nf: string,
    dataInicioIso: string,
    dataFimIso: string,
    nome?: string,
  ): Promise<AgendaResponse> {
    const cacheKey = `${nf}|${dataInicioIso}|${dataFimIso}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.response;
    }

    const [mapaForca, especiais, notas, iseo, chop, atestados, dispensas, ferias, trocas] =
      await Promise.all([
        this.coletarDoMapaForca(nf, dataInicioIso, dataFimIso),
        this.coletarEscalaEspecial(nf, dataInicioIso, dataFimIso),
        this.coletarNotasServico(nf, dataInicioIso, dataFimIso),
        this.coletarIseoHospitais(nf, dataInicioIso, dataFimIso),
        this.coletarChefesOperacoes(nf, dataInicioIso, dataFimIso),
        this.coletarAtestados(nf, dataInicioIso, dataFimIso),
        this.coletarDispensas(nf, dataInicioIso, dataFimIso),
        this.coletarFerias(nf, dataInicioIso, dataFimIso),
        this.coletarTrocasAutorizadas(nome, dataInicioIso, dataFimIso),
      ]);

    const itens = [
      ...mapaForca,
      ...especiais,
      ...notas,
      ...iseo,
      ...chop,
      ...atestados,
      ...dispensas,
      ...ferias,
      ...trocas,
    ].sort(this.compararItens);

    const hoje = todayIso();
    const proximoItem = itens.find((i) => i.data >= hoje) ?? null;
    const conflitos = this.detectarConflitos(itens);

    const response: AgendaResponse = {
      proximoItem,
      itens,
      conflitos,
      geradoEm: new Date().toISOString(),
    };

    this.cache.set(cacheKey, { response, expiresAt: Date.now() + CACHE_TTL_MS });
    return response;
  }

  /**
   * Coleta entries do militar via `MapaForcaService.getMapaForcaDoDia`
   * por dia. Reaproveita o pipeline completo: NomeMatcher (NF resolvido),
   * trocas autorizadas integradas na tripulação, fiscal, escala especial
   * misturada na composição do dia.
   */
  private async coletarDoMapaForca(
    nf: string,
    inicio: string,
    fim: string,
  ): Promise<AgendaItem[]> {
    const out: AgendaItem[] = [];
    const dias = [...iterDias(inicio, fim)];
    const resultados = await Promise.all(
      dias.map(async (data) => {
        try {
          return { data, mf: await this.mapaForca.getMapaForcaDoDia(data) };
        } catch (err) {
          this.logger.debug(`getMapaForcaDoDia ${data}: ${(err as Error).message}`);
          return null;
        }
      }),
    );
    for (const r of resultados) {
      if (!r) continue;
      const { data, mf } = r;
      for (const t of mf.tripulacao) {
        if (t.militarResolvido?.nf !== nf) continue;
        const sub: string[] = [t.viatura];
        if (t.funcao) sub.push(t.funcao);
        if (t.isFiscal) sub.push('Fiscal');
        out.push({
          data,
          fonte: 'escala_mensal',
          titulo: `Equipe ${t.equipe}`,
          subtitulo: sub.join(' · '),
          funcao: t.funcao,
          detalheUrl: `/mapa-forca/${data}`,
          id: `mf|${data}|${t.viatura}|${t.funcao}`,
        });
      }
    }
    return out;
  }

  /**
   * Escalas especiais (XLSM) — entries do militar. O parser do XLSM não
   * resolve `militarNf` (deixa undefined), por isso resolvemos sob demanda
   * via `NomeMatcher` cruzando `militarRaw` com o efetivo consolidado.
   */
  private async coletarEscalaEspecial(
    nf: string,
    inicio: string,
    fim: string,
  ): Promise<AgendaItem[]> {
    const mesesNoRange = new Set<string>();
    for (const data of iterDias(inicio, fim)) {
      const [ano, mes] = parseDataIso(data);
      mesesNoRange.add(`${ano}-${mes}`);
    }
    const escalas = [...mesesNoRange]
      .map((k) => {
        const [ano, mes] = k.split('-').map((s) => Number.parseInt(s, 10)) as [number, number];
        return this.escalasEspeciais.get(ano, mes);
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    if (escalas.length === 0) return [];

    let matcher: NomeMatcher | null = null;
    const matcherCache = new Map<string, string | null>();
    const out: AgendaItem[] = [];

    for (const escala of escalas) {
      for (const ato of escala.atos) {
        if (ato.data < inicio || ato.data > fim) continue;
        // 1) Se o ato já tem NF resolvido (importação futura), use-o.
        // 2) Caso contrário, parse `militarRaw` e resolva via NomeMatcher.
        let atoNf = ato.militarNf;
        if (!atoNf) {
          if (!matcher) {
            const efetivoTotal = await this.efetivo.getAll({
              somente1aCia: false,
              incluirEfetivoOrfao: true,
            });
            matcher = new NomeMatcher(efetivoTotal);
          }
          const cached = matcherCache.get(ato.militarRaw);
          if (cached !== undefined) {
            atoNf = cached ?? undefined;
          } else {
            const ref = parseMilitarCell(ato.militarRaw);
            const r = ref ? matcher.resolve(ref) : null;
            atoNf = r?.resolved?.nf;
            matcherCache.set(ato.militarRaw, atoNf ?? null);
          }
        }
        if (atoNf !== nf) continue;
        const horarios = parseHorarioRange(ato.horario);
        out.push({
          data: ato.data,
          fonte: 'escala_especial',
          titulo: `Especial · ${ato.funcao}`,
          subtitulo: ato.horario,
          funcao: ato.funcao,
          horarioInicio: horarios?.inicio,
          horarioFim: horarios?.fim,
          id: `especial|${ato.data}|${ato.funcao}`,
        });
      }
    }
    return out;
  }

  private async coletarNotasServico(
    nf: string,
    inicio: string,
    fim: string,
  ): Promise<AgendaItem[]> {
    const lista = this.notasServico.list({ militarNf: nf });
    return lista
      .filter((ns) => ns.data >= inicio && ns.data <= fim)
      .map((ns) => ({
        data: ns.data,
        fonte: 'nota_servico' as const,
        titulo: `${ns.codigo} · ${ns.descricao}`,
        subtitulo: ns.viaturaPrefixo
          ? `${ns.horaInicio}–${ns.horaFim} · ${ns.viaturaPrefixo}`
          : `${ns.horaInicio}–${ns.horaFim}`,
        horarioInicio: ns.horaInicio,
        horarioFim: ns.horaFim,
        detalheUrl: '/cadastros/notas-servico',
        id: `ns|${ns.id}`,
      }));
  }

  private async coletarIseoHospitais(
    nf: string,
    inicio: string,
    fim: string,
  ): Promise<AgendaItem[]> {
    try {
      const entries = await this.iseoHospitais.listByMilitar(nf);
      return entries
        .filter((e) => e.dataIso >= inicio && e.dataIso <= fim)
        .map((e) => ({
          data: e.dataIso,
          fonte: 'iseo_hospitais' as const,
          titulo: `ISEO ${e.unidade}`,
          subtitulo: e.funcao ? `${e.turno} · ${e.funcao}` : e.turno,
          funcao: e.funcao,
          detalheUrl: '/cadastros/iseo-hospitais',
          id: `iseo|${e.unidade}|${e.dataIso}|${e.turno}`,
        }));
    } catch (err) {
      this.logger.warn(`coletarIseoHospitais falhou: ${(err as Error).message}`);
      return [];
    }
  }

  private async coletarChefesOperacoes(
    nf: string,
    inicio: string,
    fim: string,
  ): Promise<AgendaItem[]> {
    const out: AgendaItem[] = [];
    for (const data of iterDias(inicio, fim)) {
      const [ano, mes, dia] = parseDataIsoCompleto(data);
      try {
        const chefes = await this.chefesOperacoes.getEscaladosDoDia(ano, mes, dia);
        for (const c of chefes) {
          if (c.nf !== nf) continue;
          out.push({
            data,
            fonte: 'chefe_operacoes',
            titulo: 'Chefe de Operações',
            subtitulo: `Marcador: ${c.marcador}`,
            id: `chop|${data}`,
          });
        }
      } catch (err) {
        this.logger.debug(`coletarChefesOperacoes ${data}: ${(err as Error).message}`);
        break;
      }
    }
    return out;
  }

  private async coletarAtestados(
    nf: string,
    inicio: string,
    fim: string,
  ): Promise<AgendaItem[]> {
    const out: AgendaItem[] = [];
    for (const data of iterDias(inicio, fim)) {
      const ativos = this.atestados.listAtivosNoDia(data);
      for (const a of ativos) {
        if (a.militarNf !== nf) continue;
        out.push({
          data,
          fonte: 'atestado',
          titulo: 'Atestado médico',
          subtitulo: `${formatDataBR(a.dataInicio)} (${a.dias}d)`,
          detalheUrl: '/cadastros/atestados',
          id: `atestado|${a.id}|${data}`,
        });
      }
    }
    return out;
  }

  private async coletarDispensas(
    nf: string,
    inicio: string,
    fim: string,
  ): Promise<AgendaItem[]> {
    const out: AgendaItem[] = [];
    for (const data of iterDias(inicio, fim)) {
      const ativas = this.dispensas.listAtivasNoDia(data);
      for (const d of ativas) {
        if (d.militarNf !== nf) continue;
        out.push({
          data,
          fonte: 'dispensa',
          titulo: `Dispensa · ${d.tipo}`,
          subtitulo: `${formatDataBR(d.dataInicio)} (${d.dias}d)`,
          detalheUrl: '/cadastros/dispensas',
          id: `dispensa|${d.id}|${data}`,
        });
      }
    }
    return out;
  }

  private async coletarFerias(
    nf: string,
    inicio: string,
    fim: string,
  ): Promise<AgendaItem[]> {
    const out: AgendaItem[] = [];
    for (const data of iterDias(inicio, fim)) {
      const ativas = this.ferias.listAtivasNoDia(data);
      for (const f of ativas) {
        if (f.militarNf !== nf) continue;
        out.push({
          data,
          fonte: 'ferias',
          titulo: 'Férias',
          subtitulo: `${formatDataBR(f.dataInicio)} (${f.dias}d)`,
          detalheUrl: '/cadastros/ferias',
          id: `ferias|${f.id}|${data}`,
        });
      }
    }
    return out;
  }

  /**
   * Trocas autorizadas (planilha externa) referem-se aos militares pelo
   * nome (não NF). Faz match por substring case-insensitive contra o
   * nome do militar logado. Inclui apenas as datas em que ele ASSUME
   * (substituto OU escaladoPagamento) — saídas já são refletidas pela
   * ausência da escala mensal naquele dia.
   */
  private async coletarTrocasAutorizadas(
    nome: string | undefined,
    inicio: string,
    fim: string,
  ): Promise<AgendaItem[]> {
    if (!nome) return [];
    const out: AgendaItem[] = [];
    const needle = nome.toUpperCase();
    try {
      const todas = await this.trocasAutorizadas.listAll();
      for (const t of todas) {
        const matchSubstituto = t.substituto?.toUpperCase().includes(needle);
        const matchPagamento = t.escaladoPagamento?.toUpperCase().includes(needle);
        if (matchSubstituto && t.dataEscala >= inicio && t.dataEscala <= fim) {
          out.push({
            data: t.dataEscala,
            fonte: 'troca_autorizada',
            titulo: 'Troca: assume serviço',
            subtitulo: `Cobre ${t.escaladoOriginal}`,
            detalheUrl: '/cadastros/trocas',
            id: `troca|${t.dataEscala}|sub`,
          });
        }
        if (matchPagamento && t.dataPagamento >= inicio && t.dataPagamento <= fim) {
          out.push({
            data: t.dataPagamento,
            fonte: 'troca_autorizada',
            titulo: 'Troca: pagamento',
            subtitulo: `Cobre ${t.substitutoPagamento}`,
            detalheUrl: '/cadastros/trocas',
            id: `troca|${t.dataPagamento}|pag`,
          });
        }
      }
    } catch (err) {
      this.logger.warn(`coletarTrocasAutorizadas falhou: ${(err as Error).message}`);
    }
    return out;
  }

  private detectarConflitos(itens: AgendaItem[]): AgendaConflito[] {
    const porData = new Map<string, AgendaItem[]>();
    for (const i of itens) {
      const arr = porData.get(i.data);
      if (arr) arr.push(i);
      else porData.set(i.data, [i]);
    }
    const conflitos: AgendaConflito[] = [];
    for (const [data, lista] of porData.entries()) {
      if (lista.length < 2) continue;
      const fontes = new Set(lista.map((i) => i.fonte));
      const temConflito = CONFLICT_PAIRS.some(
        ([a, b]) => fontes.has(a as never) && fontes.has(b as never),
      );
      if (temConflito) {
        conflitos.push({ data, itens: lista });
      }
    }
    return conflitos.sort((a, b) => a.data.localeCompare(b.data));
  }

  private compararItens(a: AgendaItem, b: AgendaItem): number {
    if (a.data !== b.data) return a.data.localeCompare(b.data);
    const aIni = a.horarioInicio ?? '00:00';
    const bIni = b.horarioInicio ?? '00:00';
    if (aIni !== bIni) return aIni.localeCompare(bIni);
    return a.fonte.localeCompare(b.fonte);
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function* iterDias(inicio: string, fim: string): Generator<string> {
  const start = new Date(`${inicio}T00:00:00Z`);
  const end = new Date(`${fim}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    yield d.toISOString().slice(0, 10);
  }
}

function parseDataIso(iso: string): [number, number] {
  const ano = Number.parseInt(iso.slice(0, 4), 10);
  const mes = Number.parseInt(iso.slice(5, 7), 10);
  return [ano, mes];
}

function parseDataIsoCompleto(iso: string): [number, number, number] {
  return [
    Number.parseInt(iso.slice(0, 4), 10),
    Number.parseInt(iso.slice(5, 7), 10),
    Number.parseInt(iso.slice(8, 10), 10),
  ];
}

function parseHorarioRange(raw: string): { inicio: string; fim: string } | null {
  const m = raw.match(/(\d{1,2}):(\d{2})\s*(?:ÀS|AS|-)\s*(\d{1,2}):(\d{2})/i);
  if (!m) return null;
  return {
    inicio: `${m[1]!.padStart(2, '0')}:${m[2]}`,
    fim: `${m[3]!.padStart(2, '0')}:${m[4]}`,
  };
}

function formatDataBR(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
