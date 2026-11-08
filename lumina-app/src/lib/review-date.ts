/**
 * Datas de revisão são DIAS de calendário no fuso de Brasília.
 *
 * O backend grava a data como meia-noite UTC (ex.: "2026-11-07T00:00:00.000Z").
 * Se a interface comparasse esse instante com o dia local do navegador, às
 * 21:00 de Brasília já seria dia 7 em UTC e uma revisão marcada para 7
 * apareceria como "Amanhã" no dia 6 — ou como vencida antes da hora. Aqui a
 * data do backend é lida pelo prefixo AAAA-MM-DD e comparada com o dia de hoje
 * em Brasília, sem passar por conversão de fuso.
 */

const DIA_MS = 86_400_000;
const FUSO_REVISAO = 'America/Sao_Paulo';

const formatador = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_REVISAO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Data de calendário em Brasília, como "AAAA-MM-DD". */
export function dataBrasilia(data: Date = new Date()): string {
  const partes = formatador.formatToParts(data);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/** Soma dias a uma data-calendário "AAAA-MM-DD" sem passar por fuso. */
export function somarDiasNaData(data: string, dias: number): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** Soma dias a um instante, devolvendo uma âncora ao meio-dia UTC do dia
 *  resultante. O meio-dia evita que uma conversão de fuso caia no dia vizinho. */
export function somarDias(data: Date, dias: number): Date {
  return new Date(`${somarDiasNaData(dataBrasilia(data), dias)}T12:00:00.000Z`);
}

function diaDaData(data: string): number {
  const [ano, mes, dia] = data.slice(0, 10).split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

/** Dias de calendário entre duas datas: positivo quando `de` é depois de `ate`. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((diaDaData(de) - diaDaData(ate)) / DIA_MS);
}

/** "AAAA-MM-DD" (ou ISO) para "DD/MM/AAAA", sem conversão de fuso. */
export function formatarData(data: string): string {
  const [ano, mes, dia] = data.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}
