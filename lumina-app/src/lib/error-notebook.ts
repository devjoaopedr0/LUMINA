import type { ErrorNotebookEntry, ErrorReason } from './api';
import {
  dataBrasilia,
  diasEntre,
  formatarData,
  somarDiasNaData,
} from './review-date.ts';

export { diasEntre, formatarData, somarDias, somarDiasNaData } from './review-date.ts';

/**
 * Leitura do caderno de erros (itens 12 e 13) sem navegador e sem servidor:
 * os rótulos do motivo do erro, os atalhos de revisão combinada e as frases que
 * traduzem a linha do tempo das tentativas. A página cuida do desenho; este
 * módulo cuida das regras — e é o que o `test/caderno-de-erros.check.ts`
 * exercita sem abrir a interface.
 */

/** Motivos do erro, na ordem em que fazem sentido para quem estuda: primeiro o
 * que faltou saber, depois o que faltou fazer. `OUTRO` existe para o que não
 * cabe na lista — nunca para dispensar a classificação. */
export const ERROR_REASONS: readonly ErrorReason[] = [
  'FALTA_CONTEUDO',
  'ERRO_INTERPRETACAO',
  'ERRO_CALCULO',
  'FALTA_ATENCAO',
  'CHUTE',
  'TEMPO_INSUFICIENTE',
  'CONFUSAO_CONCEITOS',
  'OUTRO',
];

/** Mesmos rótulos do servidor (`ERROR_REASON_LABELS`): a interface escreve o
 * que o aluno lê, o banco guarda o enum. */
export const ROTULO_MOTIVO: Record<ErrorReason, string> = {
  FALTA_CONTEUDO: 'Falta de conteúdo',
  ERRO_INTERPRETACAO: 'Erro de interpretação',
  ERRO_CALCULO: 'Erro de cálculo',
  FALTA_ATENCAO: 'Falta de atenção',
  CHUTE: 'Chute',
  TEMPO_INSUFICIENTE: 'Tempo insuficiente',
  CONFUSAO_CONCEITOS: 'Confusão entre conceitos',
  OUTRO: 'Outro motivo',
};

/** Valor do recorte "Sem motivo" no resumo, e o que o filtro envia para pedir
 * as entradas ainda não classificadas. */
export const SEM_MOTIVO = 'SEM_MOTIVO';

/** Rótulo de um motivo. Entrada sem classificação aparece como "Sem motivo" —
 *  informação, não ausência: o caderno mostra o que ainda falta classificar. */
export function rotuloMotivo(motivo: string | null | undefined): string {
  if (!motivo) return 'Sem motivo';
  return ROTULO_MOTIVO[motivo as ErrorReason] ?? motivo;
}

/** Quantos acertos seguidos depois do erro fecham a questão como dominada.
 *  Espelha `ERROR_NOTEBOOK_MASTERED_STREAK` do servidor — usado só para
 *  escrever a frase "1 de 2 acertos seguidos". */
export const ACERTOS_PARA_DOMINAR = 2;

/** Atalhos de revisão combinada. A data é o DIA da revisão no calendário de
 *  Brasília (o servidor grava a meia-noite UTC dele), então "hoje" já nasce
 *  vencido e "amanhã" só vence amanhã — inclusive às 21:00, quando o UTC já
 *  virou o dia seguinte. */
export function opcoesRevisao(hoje = new Date()): { label: string; value: string }[] {
  const hojeKey = dataBrasilia(hoje);
  return [
    { label: 'Hoje', value: hojeKey },
    { label: 'Amanhã', value: somarDiasNaData(hojeKey, 1) },
    { label: 'Em 3 dias', value: somarDiasNaData(hojeKey, 3) },
    { label: 'Em 1 semana', value: somarDiasNaData(hojeKey, 7) },
  ];
}

/** A frase que o cartão mostra sobre a revisão: para hoje, vencida ontem,
 *  em N dias, ou numa data. Sem data, nada — revisão não é obrigatória. */
export function descreverRevisao(
  entrada: Pick<ErrorNotebookEntry, 'reviewScheduledAt' | 'due'>,
  hoje = new Date(),
): string {
  if (!entrada.reviewScheduledAt) {
    return entrada.due ? 'Sem data — pendente para hoje' : 'Sem revisão marcada';
  }
  const alvo = entrada.reviewScheduledAt.slice(0, 10);
  const dias = diasEntre(alvo, dataBrasilia(hoje));
  if (dias === 0) return entrada.due ? 'Revisão para hoje' : 'Revisão marcada para hoje';
  if (dias < 0) {
    return dias === -1
      ? 'Revisão vencida ontem'
      : `Revisão vencida em ${formatarData(entrada.reviewScheduledAt)}`;
  }
  if (dias === 1) return 'Revisar amanhã';
  if (dias <= 6) return `Revisar em ${dias} dias`;
  return `Revisar em ${formatarData(entrada.reviewScheduledAt)}`;
}

export interface MarcaEvolucao {
  marca: 'E' | 'A';
  /** Posição na sequência (1 = tentativa mais antiga). */
  ordem: number;
  titulo: string;
}

/** A linha do tempo do aprendizado: "E" é o erro, "A" o acerto, na ordem em que
 *  aconteceram. Uma letra por tentativa, da mais antiga para a mais recente —
 *  é isso que prova que a questão saiu da fila por mérito, e não por data. */
export function lerEvolucao(evolucao: string): MarcaEvolucao[] {
  return [...evolucao].map((letra, indice) => ({
    marca: letra === 'A' ? 'A' : 'E',
    ordem: indice + 1,
    titulo: `Tentativa ${indice + 1}: ${letra === 'A' ? 'acertou' : 'errou'}`,
  }));
}

/** "Dominada — 2 acertos seguidos depois do erro." enquanto não domina:
 *  "1 de 2 acertos seguidos". A contagem vem da própria sequência, não de um
 *  contador paralelo. */
export function descreverEvolucao(
  entrada: Pick<ErrorNotebookEntry, 'evolution' | 'status' | 'correctStreak'>,
): string {
  const marcas = lerEvolucao(entrada.evolution);
  const tentativas = marcas.length;
  const plural = tentativas === 1 ? 'tentativa' : 'tentativas';
  if (entrada.status === 'DOMINADA') {
    const acertos = marcas.filter((marca) => marca.marca === 'A').length;
    return `Dominada — ${acertos} acertos seguidos depois do erro, em ${tentativas} ${plural}.`;
  }
  if (entrada.correctStreak === 0) {
    return `${tentativas} ${plural} registrada${tentativas === 1 ? '' : 's'}, sem acerto ainda.`;
  }
  return `Em recuperação: ${entrada.correctStreak} de ${ACERTOS_PARA_DOMINAR} acertos seguidos (${tentativas} ${plural}).`;
}

export type SituacaoFiltro = 'ABERTA' | 'DOMINADA' | 'TODAS';

export interface FiltrosCaderno {
  situacao: SituacaoFiltro;
  materia: string;
  assunto: string;
  motivo: string;
  dificuldade: string;
  soVencidas: boolean;
}

export const FILTROS_VAZIOS: FiltrosCaderno = {
  situacao: 'ABERTA',
  materia: '',
  assunto: '',
  motivo: '',
  dificuldade: '',
  soVencidas: false,
};

/** Quantos filtros estão apertados além da situação — é o número que aparece
 *  em "limpar filtros", para o botão não existir sem motivo. */
export function contarFiltrosAtivos(filtros: FiltrosCaderno): number {
  return (
    (filtros.materia ? 1 : 0) +
    (filtros.assunto ? 1 : 0) +
    (filtros.motivo ? 1 : 0) +
    (filtros.dificuldade ? 1 : 0) +
    (filtros.soVencidas ? 1 : 0)
  );
}

/** Os filtros viram a query da API. Só o que está apertado vai — e a situação
 *  padrão é a fila aberta, que a API já aplica quando o campo não vem. */
export function filtrosParaApi(
  filtros: FiltrosCaderno,
  pagina: number,
  limite = 20,
): Record<string, string | number> {
  const query: Record<string, string | number> = { page: pagina, limit: limite };
  if (filtros.situacao !== 'ABERTA') query.status = filtros.situacao;
  if (filtros.materia) query.subject = filtros.materia;
  if (filtros.assunto) query.topic = filtros.assunto;
  if (filtros.motivo) query.reason = filtros.motivo;
  if (filtros.dificuldade) query.difficulty = filtros.dificuldade;
  if (filtros.soVencidas) query.due = 'true';
  return query;
}
