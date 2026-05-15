import { Injectable, Logger } from '@nestjs/common';
import type {
  AgendaConflito,
  AgendaItem,
  AgendaResponse,
} from '@argus/shared-types';
import { EscalasService } from '../escalas/escalas.service';
import { EscalasEspeciaisService } from '../escalas-especiais/escalas-especiais.service';
import { NotasServicoService } from '../notas-servico/notas-servico.service';
import { ChefesOperacoesService } from '../chefes-operacoes/chefes-operacoes.service';
import { IseoHospitaisService } from '../iseo-hospitais/iseo-hospitais.service';

const CACHE_TTL_MS = 60_000;

interface CacheKey {
  nf: string;
  inicio: string;
  fim: string;
}

interface CacheEntry {
  response: AgendaResponse;
  expiresAt: number;
}

/**
 * Pares de fontes operacionalmente conflitantes (o militar não pode estar
 * em ambas no mesmo dia). Lista explícita: nem todo "mesmo dia" é conflito
 * (ex.: 2 NS no mesmo dia podem ser legítimos se em horários diferentes).
 */
const CONFLICT_PAIRS: Array<[string, string]> = [
  ['escala_mensal', 'iseo_hospitais'],
  ['escala_mensal', 'chefe_operacoes'],
  ['escala_mensal', 'nota_servico'],
  ['iseo_hospitais', 'escala_especial'],
  ['iseo_hospitais', 'chefe_operacoes'],
  ['chefe_operacoes', 'nota_servico'],
];

/**
 * Agrega as próximas escalas de um militar a partir de todas as fontes
 * (Escala Mensal, Especial, Notas de Serviço, ISEO Hospitais, ChOp).
 *
 * Implementação pura — não persiste estado. Cache leve por (nf, range)
 * de 60s para evitar refetches em cliques rápidos de toggle list/calendar.
 */
@Injectable()
export class AgendaService {
  private readonly logger = new Logger(AgendaService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly escalas: EscalasService,
    private readonly escalasEspeciais: EscalasEspeciaisService,
    private readonly notasServico: NotasServicoService,
    private readonly chefesOperacoes: ChefesOperacoesService,
    private readonly iseoHospitais: IseoHospitaisService,
  ) {}

  async forMilitar(
    nf: string,
    dataInicioIso: string,
    dataFimIso: string,
  ): Promise<AgendaResponse> {
    const cacheKey = this.cacheKey({ nf, inicio: dataInicioIso, fim: dataFimIso });
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.response;
    }

    const [escalaMensal, escalaEspecial, notas, iseo, chop] = await Promise.all([
      this.coletarEscalaMensal(nf, dataInicioIso, dataFimIso),
      this.coletarEscalaEspecial(nf, dataInicioIso, dataFimIso),
      this.coletarNotasServico(nf, dataInicioIso, dataFimIso),
      this.coletarIseoHospitais(nf, dataInicioIso, dataFimIso),
      this.coletarChefesOperacoes(nf, dataInicioIso, dataFimIso),
    ]);

    const itens = [...escalaMensal, ...escalaEspecial, ...notas, ...iseo, ...chop].sort(
      this.compararItens,
    );

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

  private cacheKey(k: CacheKey): string {
    return `${k.nf}|${k.inicio}|${k.fim}`;
  }

  private async coletarEscalaMensal(
    nf: string,
    inicio: string,
    fim: string,
  ): Promise<AgendaItem[]> {
    const out: AgendaItem[] = [];
    for (const data of iterDias(inicio, fim)) {
      const [ano, mes] = parseDataIso(data);
      try {
        const { equipe, entries } = this.escalas.getEscaladosDoDia(ano, mes, data);
        if (!equipe) continue;
        for (const e of entries) {
          if (e.militar.nf !== nf) continue;
          out.push({
            data,
            fonte: 'escala_mensal',
            titulo: `Equipe ${equipe} · ${e.viatura}`,
            subtitulo: e.funcao,
            funcao: e.funcao,
            detalheUrl: `/mapa-forca/${data}`,
            id: `mensal|${data}|${e.viatura}|${e.funcao}`,
          });
        }
      } catch (err) {
        this.logger.debug(`coletarEscalaMensal ${data}: ${(err as Error).message}`);
      }
    }
    return out;
  }

  private async coletarEscalaEspecial(
    nf: string,
    inicio: string,
    fim: string,
  ): Promise<AgendaItem[]> {
    const out: AgendaItem[] = [];
    const mesesVisitados = new Set<string>();
    for (const data of iterDias(inicio, fim)) {
      const [ano, mes] = parseDataIso(data);
      const k = `${ano}-${mes}`;
      if (mesesVisitados.has(k)) continue;
      mesesVisitados.add(k);
      const escala = this.escalasEspeciais.get(ano, mes);
      if (!escala) continue;
      for (const ato of escala.atos) {
        if (ato.data < inicio || ato.data > fim) continue;
        if (ato.militarNf !== nf) continue;
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
