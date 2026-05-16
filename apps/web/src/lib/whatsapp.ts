import type { LetraEquipe, MapaForcaDoDia, TripulacaoEntry } from '@argus/shared-types';
import { periodoToLabel } from './periodo-troca';

/**
 * Geração do texto da Prévia no formato Markdown WhatsApp esperado pelo Fiscal.
 *
 * Sample-oracle: `docs/exemplos/previa-whatsapp-19042026.md`. O `formatPreviaParaWhatsapp.test`
 * usa snapshot pra garantir que mudanças no formato são intencionais.
 *
 * Estrutura (S5/F7d):
 *   *PRÉVIA MAPA FORÇA*
 *   *EQUIPE [NOME]*
 *   DD/MM/AAAA
 *
 *   1. VIATURAS
 *   [emoji] *[Nome do Recurso] - [VTR Prefixo]* [***#STATUS#*** se ≠ disponível]
 *   Ch: [...]; Mot: [...]; Op1: [...] (Op2-Op3 quando houver)
 *   ...
 *
 *   2. TROCAS
 *   3. ESCALA ESPECIAL
 *   4. NOTAS DE SERVIÇO
 *   5. DISPENSA
 *   6. IDEO
 */

interface ViaturaResumo {
  codigo: string;
  recurso?: string;
  emoji: string;
  vtrStatus?: string | null;
}

const EMOJI_RECURSO: Record<string, string> = {
  'CHEFE DE OPERAÇÕES': '🛻⭐',
  ABTS_01: '🚒',
  ABTS_02: '🚒',
  'ABTS 01': '🚒',
  'ABTS 02': '🚒',
  ATB: '🚒',
  'ATB e Plat.': '🚒',
  PLATAFORMA: '🪜',
  'RESGATE 01': '🚑',
  'RESGATE 02': '🚑',
  RESGATE: '🚑',
  GUARDA: '💂',
  'MERGULHO 01': '🤿👨‍🚒',
  'MERGULHO 02': '🤿👨‍🚒',
  'SALVAMAR 01': '🚒🤿',
  'SALVAMAR 02': '🚒🤿',
};

function emojiPara(viaturaOuRecurso: string): string {
  if (EMOJI_RECURSO[viaturaOuRecurso]) return EMOJI_RECURSO[viaturaOuRecurso];
  for (const [k, v] of Object.entries(EMOJI_RECURSO)) {
    if (viaturaOuRecurso.toUpperCase().includes(k.toUpperCase())) return v;
  }
  return '🚒';
}

function formatarData(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function statusInline(status?: string | null): string {
  if (!status) return '';
  if (status === 'operacional') return '';
  // Mapear p/ token visível no WhatsApp (sample mostra `***#BAIXADA#***`)
  const tagged = status.toUpperCase();
  return ` ***#${tagged}#***`;
}

function nomeMilitar(t: TripulacaoEntry): string {
  if (t.militarResolvido) {
    const nome = t.militarResolvido.nomeGuerra ?? t.militarResolvido.nome.split(' ')[0];
    return `${t.militarResolvido.posto} ${nome}`;
  }
  return t.militarRef.raw;
}

/** Agrupa a tripulação por viatura, preservando ordem original. */
function agruparPorViatura(tripulacao: TripulacaoEntry[]): Map<string, TripulacaoEntry[]> {
  const m = new Map<string, TripulacaoEntry[]>();
  for (const t of tripulacao) {
    const k = t.viatura || '(sem viatura)';
    const arr = m.get(k) ?? [];
    arr.push(t);
    m.set(k, arr);
  }
  return m;
}

/**
 * Função pura: MapaForcaDoDia → texto WhatsApp Markdown.
 * Usado no botão "Copiar para WhatsApp" na tela `/mapa-forca/:data`.
 */
export function formatPreviaParaWhatsapp(previa: MapaForcaDoDia): string {
  const lines: string[] = [];
  lines.push('*PRÉVIA MAPA FORÇA*');
  if (previa.equipeNome) {
    lines.push(`*EQUIPE ${previa.equipeNome}*`);
  } else {
    lines.push('*SEM EQUIPE ESCALADA*');
  }
  lines.push(formatarData(previa.data));
  lines.push('');
  lines.push('1. VIATURAS');
  lines.push('');

  // Mapa rápido de viatura→status (vem de viaturasOperacionais com vtrStatus)
  const viaturaInfo = new Map<string, ViaturaResumo>();
  for (const v of previa.viaturasOperacionais) {
    viaturaInfo.set(v.codigo, {
      codigo: v.codigo,
      recurso: v.descricao,
      emoji: emojiPara(v.descricao ?? v.codigo),
      vtrStatus: v.vtrStatus,
    });
  }

  const grupos = agruparPorViatura(previa.tripulacao);
  // Ordem: STAFF (ChOp) primeiro, depois rotativas A/B/C/D, depois AQUATICAS.
  const equipeOrdem: Record<LetraEquipe, number> = {
    STAFF: 0,
    A: 1,
    B: 1,
    C: 1,
    D: 1,
    AQUATICAS: 2,
  };
  const viaturasOrdenadas = [...grupos.entries()].sort((a, b) => {
    const ea = a[1][0]?.equipe ?? 'A';
    const eb = b[1][0]?.equipe ?? 'A';
    if (equipeOrdem[ea] !== equipeOrdem[eb]) return equipeOrdem[ea] - equipeOrdem[eb];
    return a[0].localeCompare(b[0]);
  });

  for (const [viatura, entries] of viaturasOrdenadas) {
    const info = viaturaInfo.get(viatura);
    const emoji = info?.emoji ?? emojiPara(viatura);
    const recursoLabel =
      info?.recurso && info.recurso !== viatura ? `${info.recurso} - ${viatura}` : viatura;
    lines.push(`${emoji} *${recursoLabel}*${statusInline(info?.vtrStatus)}`);
    for (const t of entries) {
      lines.push(`${t.funcao}: ${nomeMilitar(t)}`);
    }
    lines.push('');
  }

  // 2. TROCAS
  lines.push('2. TROCAS:');
  if (previa.trocas.length === 0) {
    lines.push('Sem trocas.');
  } else {
    previa.trocas.forEach((t, i) => {
      lines.push(`${i + 1}.`);
      lines.push(`SUBSTITUÍDO: ${t.substituidoRaw}`);
      lines.push(`SUBSTITUTO: ${t.substitutoRaw}`);
      lines.push(`PERÍODO: ${periodoToLabel(t.periodo)}`);
      if (t.motivo) lines.push(`MOTIVO: ${t.motivo}`);
    });
  }
  lines.push('');

  // 3. ESCALA ESPECIAL
  lines.push('3. ESCALA ESPECIAL:');
  if (previa.escalaEspecial.matutina) {
    lines.push(`Matutina: ${previa.escalaEspecial.matutina.militarRaw}`);
  }
  if (previa.escalaEspecial.vespertina) {
    lines.push(`Vespertina: ${previa.escalaEspecial.vespertina.militarRaw}`);
  }
  if (!previa.escalaEspecial.matutina && !previa.escalaEspecial.vespertina) {
    lines.push('Sem escala especial.');
  }
  lines.push('');

  // 4. NOTAS DE SERVIÇO
  lines.push('4. NOTAS DE SERVIÇO');
  if (previa.notasServico.length === 0) {
    lines.push('Sem NS aplicáveis.');
  } else {
    for (const ns of previa.notasServico) {
      lines.push(ns.descricao ? `${ns.codigo} - ${ns.descricao}` : ns.codigo);
    }
  }
  lines.push('');

  // 5. DISPENSA
  lines.push('5. DISPENSA:');
  if (previa.dispensas.length === 0) {
    lines.push('Sem dispensas.');
  } else {
    for (const d of previa.dispensas) {
      lines.push(d.motivo ? `${d.militarRaw} (${d.motivo})` : d.militarRaw);
    }
  }
  lines.push('');

  // 6. IDEO
  lines.push('6. IDEO:');
  previa.ideo.forEach((entry, idx) => {
    lines.push(`6.${idx + 1} ${entry.tipo}`);
    for (const item of entry.itens) lines.push(item);
  });

  return lines.join('\n').trimEnd();
}
