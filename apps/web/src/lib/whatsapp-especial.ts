import type { EscalaEspecialMensal } from '@argus/shared-types';

const MES_LABEL = [
  '',
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function formatarData(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Gera o aviso WhatsApp da Escala Especial mensal — formato espelhado da aba
 * `Modelo Aviso - Especial` do XLSM.
 *
 * Estrutura:
 *   *ESCALA ESPECIAL — [MES] DE [ANO]*
 *
 *   *DD/MM/YYYY*
 *   • [MILITAR] — [HORÁRIO] ([FUNÇÃO])
 *   ...
 */
export function formatEscalaEspecialParaWhatsapp(escala: EscalaEspecialMensal): string {
  const lines: string[] = [];
  lines.push(`*ESCALA ESPECIAL — ${MES_LABEL[escala.mes]?.toUpperCase()} DE ${escala.ano}*`);
  lines.push('');

  // Agrupa por data
  const byData = new Map<string, EscalaEspecialMensal['atos']>();
  for (const a of escala.atos) {
    const arr = byData.get(a.data) ?? [];
    arr.push(a);
    byData.set(a.data, arr);
  }
  const datasOrdenadas = [...byData.keys()].sort();

  for (const data of datasOrdenadas) {
    lines.push(`*${formatarData(data)}*`);
    const atos = byData.get(data) ?? [];
    for (const a of atos) {
      lines.push(`• ${a.militarRaw} — ${a.horario} (${a.funcao})`);
    }
    lines.push('');
  }

  lines.push(`_Total: ${escala.atos.length} atos especiais. Origem: ${escala.origemArquivo}._`);

  return lines.join('\n').trimEnd();
}
