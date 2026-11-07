import type { ReviewQueueItem, ReviewQueueKind } from './api';

/**
 * Leitura da central de revisões (item 31) sem navegador: a frase de
 * vencimento, o rótulo da origem e o detalhe que transforma um item genérico em
 * uma decisão de estudo. Módulo folha de propósito — o `node` carrega direto
 * nos checks.
 */

const DIA_MS = 86_400_000;

function diaLocal(data: Date): number {
  return Date.UTC(data.getFullYear(), data.getMonth(), data.getDate());
}

function diaDoIso(iso: string): number {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

/** Dias de calendário entre a data e hoje: negativo = venceu, 0 = hoje. */
export function diasAte(iso: string, agora = new Date()): number {
  return Math.round((diaDoIso(iso) - diaLocal(agora)) / DIA_MS);
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * "Venceu ontem", "Vence hoje", "Amanhã", "Em 3 dias" ou a data. A revisão é
 * um DIA, não um instante: por isso a comparação ignora a hora local.
 */
export function descreverVencimento(
  iso: string | null | undefined,
  agora = new Date(),
): string {
  if (!iso) return 'Sem data';
  const dias = diasAte(iso, agora);
  if (dias < -1) return `Venceu há ${Math.abs(dias)} dias`;
  if (dias === -1) return 'Venceu ontem';
  if (dias === 0) return 'Vence hoje';
  if (dias === 1) return 'Amanhã';
  if (dias <= 6) return `Em ${dias} dias`;
  return `Em ${formatarData(iso)}`;
}

export function rotuloOrigem(kind: ReviewQueueKind): string {
  if (kind === 'TOPIC') return 'Tópico';
  if (kind === 'ERROR_NOTEBOOK') return 'Caderno de erros';
  return 'Marcada por você';
}

/** O detalhe curto que explica por que o item está naquela fila. */
export function detalheDoItem(item: ReviewQueueItem): string {
  if (item.kind === 'TOPIC') {
    const tentativas = item.attempts ?? 0;
    return `Domínio ${item.masteryScore ?? 0}/100 · ${tentativas} tentativa${
      tentativas === 1 ? '' : 's'
    }`;
  }
  if (item.kind === 'ERROR_NOTEBOOK') {
    const erros = item.wrongAttempts ?? 1;
    // Espelha ERROR_NOTEBOOK_MASTERED_STREAK do servidor.
    return `${erros} erro${erros === 1 ? '' : 's'} · ${item.correctStreak ?? 0} de 2 acertos seguidos`;
  }
  if (!item.attempts) return 'Ainda não respondida';
  return `${item.accuracy ?? 0}% de acertos · ${item.attempts} tentativa${
    item.attempts === 1 ? '' : 's'
  }`;
}

/** Total de dívidas de revisão: o que venceu mais o que o aluno marcou. */
export function totalPendente(queue: {
  due: { total: number };
  manual: { total: number };
}): number {
  return queue.due.total + queue.manual.total;
}
