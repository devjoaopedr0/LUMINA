/**
 * Compara duas medições do gabarito sugerido questão a questão. Função pura,
 * usada pelo `answer-keys:eval -- --compare <relatório.json>`.
 */

export interface MeasuredItem {
  number: number;
  language: string;
  outcome: { status: string };
}

export type Change = 'fixed' | 'broke' | 'nowPending' | 'nowAnswered' | 'stillWrong';

export interface ComparisonRow {
  key: string;
  before: string;
  after: string;
  change: Change;
}

const ANSWERED = new Set(['correct', 'wrong']);

/** Só olha as questões medidas nas duas rodadas; puladas e erros de cota ficam de fora. */
export function compareMeasurements(before: MeasuredItem[], after: MeasuredItem[]): { rows: ComparisonRow[]; summary: Record<Change, number> } {
  const key = (item: MeasuredItem) => `Q${item.number}${item.language ? `/${item.language}` : ''}`;
  const previous = new Map(before.map((item) => [key(item), item.outcome.status]));
  const rows: ComparisonRow[] = [];
  for (const item of after) {
    const was = previous.get(key(item));
    const now = item.outcome.status;
    if (!was || was === now && now !== 'wrong') continue;
    const relevant = (status: string) => ANSWERED.has(status) || status === 'pending';
    if (!relevant(was) || !relevant(now)) continue;
    let change: Change;
    if (now === 'correct') change = was === 'pending' ? 'nowAnswered' : 'fixed';
    else if (now === 'wrong') change = was === 'wrong' ? 'stillWrong' : was === 'correct' ? 'broke' : 'nowAnswered';
    else change = 'nowPending';
    rows.push({ key: key(item), before: was, after: now, change });
  }
  const summary: Record<Change, number> = { fixed: 0, broke: 0, nowPending: 0, nowAnswered: 0, stillWrong: 0 };
  for (const row of rows) summary[row.change]++;
  return { rows, summary };
}

export const CHANGE_LABEL: Record<Change, string> = {
  fixed: 'erradas que passaram a corretas',
  broke: 'corretas que passaram a erradas',
  nowPending: 'viraram pendência (revisão do professor)',
  nowAnswered: 'pendências que passaram a ter resposta',
  stillWrong: 'continuam erradas',
};
