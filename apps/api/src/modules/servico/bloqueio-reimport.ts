import type { BloqueioReimport, EstadoServico } from '@argus/shared-types';
import type { ServicoService } from './servico.service';

/**
 * Estados em que um dia está "em uso" e portanto NÃO pode ter sua escala
 * sobrescrita por re-import. Apenas dias `NAO_INICIADO` são livres.
 */
const ESTADOS_BLOQUEADOS: ReadonlySet<EstadoServico> = new Set([
  'PREVIA_INICIADA',
  'INICIADO',
  'EQUIPE_CONFERIDA',
  'VIATURA_CONFERIDA',
  'PREENCHENDO_MF',
  'ENCERRADO',
]);

/**
 * Mensagem amigável por estado, exibida no frontend.
 */
function motivoFor(estado: EstadoServico): string {
  switch (estado) {
    case 'PREVIA_INICIADA':
      return 'Prévia iniciada — cancele a Prévia antes de re-importar';
    case 'INICIADO':
    case 'EQUIPE_CONFERIDA':
    case 'VIATURA_CONFERIDA':
    case 'PREENCHENDO_MF':
      return 'Serviço em andamento — aguarde encerramento';
    case 'ENCERRADO':
      return 'Serviço encerrado — registros são imutáveis';
    default:
      return 'Dia em uso';
  }
}

/**
 * Para uma lista de datas ISO, retorna apenas as que estão "bloqueadas"
 * (em uso). Lista vazia = nenhum bloqueio (re-import permitido).
 */
export function computeBloqueios(
  servico: ServicoService,
  datas: readonly string[],
): BloqueioReimport[] {
  const bloqueios: BloqueioReimport[] = [];
  for (const data of datas) {
    const { estado } = servico.get(data);
    if (ESTADOS_BLOQUEADOS.has(estado)) {
      bloqueios.push({ data, estado, motivo: motivoFor(estado) });
    }
  }
  return bloqueios.sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Helper para o caller emitir mensagem de erro consistente quando o
 * confirm é rejeitado. Frontend já mostra a lista detalhada via
 * `bloqueios`, então a mensagem é compacta.
 */
export function bloqueiosToMessage(bloqueios: BloqueioReimport[]): string {
  if (bloqueios.length === 0) return '';
  if (bloqueios.length === 1) {
    return `Re-import bloqueado: ${bloqueios[0]!.data} — ${bloqueios[0]!.motivo}`;
  }
  return `Re-import bloqueado: ${bloqueios.length} dias em uso (primeiro: ${bloqueios[0]!.data})`;
}
