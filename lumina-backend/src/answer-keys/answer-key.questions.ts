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

export interface SuggestionAlternative {
  position: number;
  text: string;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
export const positionLetter = (position: number | null | undefined) => (position ? LETTERS[position - 1] ?? '?' : '—');

/**
 * Alternativas marcadas como corretas no banco. O gabarito sugerido só pode
 * usar a resposta pronta quando há exatamente uma: nenhuma significa que a IA
 * precisa decidir; mais de uma é ambiguidade do cadastro e não vira sugestão.
 */
export function correctPositions(alternatives: { position: number; isCorrect: boolean }[]): number[] {
  return alternatives.filter((a) => a.isCorrect).map((a) => a.position);
}

/**
 * Entre questões equivalentes (mesmo número e língua), prefere a do banco
 * público — a mesma regra da explicação, para o aluno não depender do
 * workspace de quem importou. Sem banco público, usa a primeira acessível.
 */
export function pickAccessibleQuestion<T extends { workspaceId: string }>(candidates: T[], bankWorkspaceId: string | null): T | null {
  return candidates.find((q) => q.workspaceId === bankWorkspaceId) ?? candidates[0] ?? null;
}

/** Prompt do gabarito sugerido: resposta fechada e justificativa curta, sem invenção. */
/**
 * Modelos do gabarito (sugestão e explicação por questão), em ordem de
 * tentativa. A medição de 12/11/2026 mostrou que o modelo padrão do chat
 * (nemotron gratuito) acerta bem menos e força alternativas quando a conta não
 * fecha; por isso o gabarito tem cadeia própria: AI_ANSWER_KEY_MODELS, ou, sem
 * ela, a cadeia da redação (AI_ESSAY_MODELS, que começa pelo Gemini). Vazio =
 * cadeia padrão do AiService.
 */
export function answerKeyModels(env: Record<string, string | undefined> = process.env): string[] {
  const parse = (raw: string | undefined) => (raw ?? '').split(',').map((model) => model.trim()).filter(Boolean);
  const own = parse(env.AI_ANSWER_KEY_MODELS);
  return own.length ? own : parse(env.AI_ESSAY_MODELS);
}

export const SUGGESTION_SYSTEM_PROMPT = [
  'Você é a LuminIA, professora do Ensino Médio. Sugira a alternativa correta de uma questão de múltipla escolha usando SOMENTE o enunciado e as alternativas fornecidos.',
  'Regras:',
  '- Escolha exatamente uma alternativa, de A a E, que responda ao comando da questão.',
  '- Justifique em no máximo três frases, citando o trecho do enunciado ou o raciocínio que sustenta a escolha.',
  '- Não invente dados, leis, fórmulas, textos, contexto externo ou uma alternativa que não esteja na lista.',
  '- Se o enunciado estiver incompleto, depender de imagem ou não permitir uma decisão segura, devolva "answer": null e explique o que falta na justificativa.',
  '- Responda somente com JSON válido, sem markdown e sem texto antes ou depois: {"answer":"A","justification":"..."}.',
].join('\n');

export function suggestionPrompt(params: {
  stem: string;
  subject: string;
  area: string | null;
  alternatives: SuggestionAlternative[];
}): string {
  const alternatives = params.alternatives
    .map((a) => `${positionLetter(a.position)}) ${a.text}`)
    .join('\n');
  return [
    `Disciplina: ${params.subject}${params.area ? ` · ${params.area}` : ''}`,
    `Enunciado:\n${params.stem}`,
    `Alternativas:\n${alternatives}`,
    'Sugira a alternativa correta e justifique. Responda apenas o JSON pedido.',
  ].join('\n\n');
}

export type SuggestedAnswerOutcome =
  | { position: number; justification: string }
  | { position: null; justification: string };

/**
 * Lê a sugestão da IA. Só aceita uma alternativa existente e uma justificativa
 * com conteúdo: sem isso, é melhor não sugerir do que preencher com invenção.
 * Quando a IA devolve `answer: null`, a justificativa é preservada como motivo
 * da pendência — é ela que explica, por exemplo, que falta a imagem.
 * A confiança não vem daqui — o serviço só a preenche quando há base
 * calculável (resposta já registrada no banco).
 */
export function parseSuggestedAnswerOutcome(text: string, alternatives: SuggestionAlternative[]): SuggestedAnswerOutcome | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const raw = data as { answer?: unknown; justification?: unknown };
  const justification = typeof raw.justification === 'string' ? plainExplanation(raw.justification).trim() : '';
  if (raw.answer === null) {
    return justification.length >= 10 ? { position: null, justification: justification.slice(0, 800) } : null;
  }
  let position: number | null = null;
  if (typeof raw.answer === 'number' && Number.isInteger(raw.answer)) position = raw.answer;
  else if (typeof raw.answer === 'string') {
    const value = raw.answer.trim().toUpperCase();
    if (/^[A-E]$/.test(value)) position = LETTERS.indexOf(value) + 1;
    else if (/^[1-5]$/.test(value)) position = Number(value);
    else {
      const letter = /^([A-E])(?:[).:\s-]|$)/.exec(value);
      if (letter) position = LETTERS.indexOf(letter[1]) + 1;
    }
  }
  if (!position || !alternatives.some((a) => a.position === position)) return null;
  if (justification.length < 10) return null;
  return { position, justification: justification.slice(0, 800) };
}

/** Compatibilidade: só devolve sugestão quando há uma alternativa escolhida. */
export function parseSuggestedAnswer(text: string, alternatives: SuggestionAlternative[]): { position: number; justification: string } | null {
  const outcome = parseSuggestedAnswerOutcome(text, alternatives);
  return outcome && outcome.position !== null ? { position: outcome.position, justification: outcome.justification } : null;
}

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
