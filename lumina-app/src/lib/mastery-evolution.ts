/**
 * Evolução do domínio (mapa de domínio): tipos e a conta do gráfico de
 * linha. Puro, testado em test/mapa-dominio.check.ts.
 */

export interface TopicChange {
  topicId: string;
  topic: string;
  subject: string;
  from: number;
  to: number;
  delta: number;
}

export interface MasteryEvolution {
  points: string[];
  overall: (number | null)[];
  subjects: { subject: string; series: (number | null)[] }[];
  week: { improved: TopicChange[]; declined: TopicChange[]; started: number };
}

/**
 * Pontos SVG de uma série 0–100 num quadro `width` × `height`. Pontos nulos
 * quebram a linha (o tópico ainda não tinha sido estudado), em vez de cair a zero.
 */
export function linePaths(series: (number | null)[], width: number, height: number, pad = 4): string[] {
  if (series.length === 0) return [];
  const step = series.length > 1 ? (width - pad * 2) / (series.length - 1) : 0;
  const y = (value: number) => pad + (height - pad * 2) * (1 - Math.min(100, Math.max(0, value)) / 100);
  const paths: string[] = [];
  let current: string[] = [];
  series.forEach((value, i) => {
    if (value === null) {
      if (current.length) paths.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${current.length ? 'L' : 'M'}${(pad + i * step).toFixed(1)},${y(value).toFixed(1)}`);
  });
  if (current.length) paths.push(current.join(' '));
  return paths;
}

/** Variação entre o primeiro e o último ponto com valor ("+12", "−5", "0"); null sem dados. */
export function seriesChange(series: (number | null)[]): string | null {
  const values = series.filter((v): v is number => v !== null);
  if (values.length < 2) return null;
  const delta = values[values.length - 1] - values[0];
  return delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : '0';
}

/** "13/11" a partir de "2026-11-13". */
export function shortDate(key: string): string {
  const [, month, day] = key.split('-');
  return `${day}/${month}`;
}
