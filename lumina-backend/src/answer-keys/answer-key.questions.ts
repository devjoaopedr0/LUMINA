/**
 * Ligação entre o gabarito e as questões do banco e a explicação da LuminIA.
 *
 * Funções puras: não tocam no banco e não chamam a IA. O serviço usa estas
 * peças para montar o prompt e para ter uma resposta honesta quando não há
 * questão ligada ou quando a IA não está configurada.
 */

export interface KeyQuestionRef {
  number: number;
  language: string;
}

export interface LinkedQuestion {
  id: string;
  workspaceId: string;
  stem: string;
  subject: string;
  imageUrl?: string | null;
  alternatives: { position: number; text: string; isCorrect: boolean }[];
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
export const positionLetter = (position: number | null | undefined) => (position ? LETTERS[position - 1] ?? '?' : '—');

/**
 * `sourceId` canônico das questões importadas do ENEM (ver EnemImportService).
 * As questões de língua do 1º dia têm um sufixo por idioma, porque o mesmo
 * número aparece duas vezes no caderno.
 */
export function enemQuestionSourceId(year: number, day: number, item: KeyQuestionRef): string {
  return `enem-${year}-d${day}-q${item.number}${item.language ? `-${item.language.toLowerCase()}` : ''}`;
}

/**
 * Escolhe a questão do banco público. Fora dele não há vínculo: a explicação
 * precisa funcionar para qualquer aluno autenticado, não só para quem tem
 * acesso ao workspace de quem importou o caderno.
 */
export function pickQuestion(candidates: { id: string; workspaceId: string }[], bankWorkspaceId: string | null): string | null {
  if (!candidates.length || !bankWorkspaceId) return null;
  return candidates.find((q) => q.workspaceId === bankWorkspaceId)?.id ?? null;
}

/** Texto de apoio quando a IA não está configurada ou falhou. Não inventa conteúdo. */
export function fallbackExplanation(params: {
  correct: number | null;
  selected: number | null;
  stem: string;
  alternatives: { position: number; text: string }[];
}): string {
  const correct = positionLetter(params.correct);
  const selected = params.selected === null ? null : positionLetter(params.selected);
  const correctText = params.alternatives.find((a) => a.position === params.correct)?.text?.trim();
  const lines: string[] = [];
  if (params.correct === null) {
    lines.push('Esta questão foi anulada pela banca: não há resposta correta a cobrar.');
    return lines.join('\n\n');
  }
  lines.push(`A resposta correta é a alternativa ${correct}${correctText ? ` — “${correctText}”` : ''}.`);
  if (selected === null) {
    lines.push('Você deixou a questão em branco. Releia o comando e elimine as alternativas que contradizem o enunciado antes de marcar.');
  } else if (params.selected === params.correct) {
    lines.push('Você marcou a alternativa correta. Explique para si mesmo, em uma frase, por que as outras estão erradas: isso fixa melhor do que só acertar.');
  } else {
    lines.push(`Você marcou a alternativa ${selected}. Compare-a com o comando da questão e com o trecho do enunciado que sustenta a resposta ${correct}; o erro costuma estar em uma palavra que muda o sentido.`);
  }
  lines.push('A explicação detalhada da LuminIA não está disponível neste ambiente (provedor de IA não configurado ou fora do ar). O texto acima é só um roteiro de revisão, sem conteúdo inventado.');
  return lines.join('\n\n');
}

/**
 * A IA às vezes devolve markdown mesmo quando o prompt pede texto puro. A
 * interface mostra a explicação como texto (sem renderizar markdown), então
 * os marcadores de ênfase apareceriam como asteriscos. Remove só a marcação
 * mais comum, sem tocar no conteúdo.
 */
export function plainExplanation(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

/** Prompt enviado à LuminIA para explicar uma questão já respondida. */
export function explanationPrompt(params: {
  stem: string;
  subject: string;
  area: string | null;
  alternatives: { position: number; text: string }[];
  correct: number | null;
  selected: number | null;
  hasImage: boolean;
}): string {
  const alternatives = params.alternatives
    .map((a) => `${positionLetter(a.position)}) ${a.text}`)
    .join('\n');
  const selected = params.selected === null ? 'em branco' : `${positionLetter(params.selected)}) ${params.alternatives.find((a) => a.position === params.selected)?.text ?? ''}`;
  return [
    `Disciplina: ${params.subject}${params.area ? ` · ${params.area}` : ''}`,
    `Enunciado:\n${params.stem}`,
    `Alternativas:\n${alternatives}`,
    `Resposta correta: ${positionLetter(params.correct)}`,
    `Resposta do aluno: ${selected}`,
    params.hasImage ? 'A questão tem uma imagem que não está disponível para leitura; considere só o texto.' : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const EXPLANATION_SYSTEM_PROMPT = [
  'Você é a LuminIA, tutora de estudos para o Enem. Explique a questão abaixo em português do Brasil, com linguagem direta e acolhedora.',
  'Regras:',
  '- Comece pela alternativa correta, citando o trecho do enunciado que a sustenta.',
  '- Se o aluno marcou uma alternativa errada, explique o erro dela; se deixou em branco, dê uma estratégia de leitura.',
  '- Não invente dados, leis, fórmulas ou passagens que não estejam no enunciado e nas alternativas.',
  '- Não fale sobre gabarito oficial, IA ou pontuação; fale só do conteúdo.',
  '- Máximo de três parágrafos curtos. Sem listas longas e sem markdown.',
].join('\n');
