import type { QuestionDifficulty, WebSearchHit } from './api';
import { positionLetter } from './question-labels.ts';

/**
 * Regras da transcrição de questão vinda da busca web.
 *
 * Ficam aqui, fora do componente, por um motivo prático: a parte delicada —
 * manter as justificativas alinhadas com as alternativas quando o usuário
 * remove, acrescenta ou deixa uma alternativa em branco — é exatamente o tipo de
 * lógica que o typecheck não pega e que o `test/transcricao-questoes.check.ts`
 * precisa exercitar sem navegador. O componente cuida do desenho; este módulo
 * cuida do estado.
 */

export const MIN_STEM = 5;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

/** Reexportado para quem já importa daqui: a convenção de letra é a mesma em
 * toda a interface e mora em `question-labels`. */
export { positionLetter };

/** Conteúdo transcrito pelo usuário a partir do resultado da busca. É o que
 * realmente vai para o banco — a Lumina não baixa nem guarda o texto da
 * página de origem, então o preenchimento é responsabilidade de quem está
 * usando a plataforma. */
export interface TranscribedQuestion {
  subject: string;
  topic: string;
  exam: string;
  year: string;
  difficulty: QuestionDifficulty;
  stem: string;
  options: string[];
  /** "Por que esta está errada", na mesma ordem de `options`. Vazio = não
   * escreveu. O aluno só vê isso depois de responder. */
  optionExplanations: string[];
  correctIndex: number;
  explanation: string;
}

/**
 * Estado inicial a partir do resultado da busca: a classificação vem
 * preenchida e o enunciado entra só como ponto de partida (o trecho da busca é
 * um pedaço do enunciado, nunca conteúdo final).
 */
export function initialTranscriptionState(hit: WebSearchHit): TranscribedQuestion {
  const classification = hit.classification;
  const snippet = (hit.snippet ?? '').trim();
  return {
    subject: classification?.subject ?? '',
    topic: classification?.topic ?? '',
    exam: classification?.exam ?? '',
    year: classification?.year ? String(classification.year) : '',
    difficulty: classification?.difficulty ?? 'MEDIA',
    stem: snippet.length >= MIN_STEM ? snippet : '',
    options: ['', ''],
    optionExplanations: ['', ''],
    correctIndex: 0,
    explanation: '',
  };
}

/**
 * Acrescenta uma alternativa vazia **e** a justificativa correspondente. São
 * dois vetores paralelos: um sem o outro desalinha a questão salva (a
 * justificativa da alternativa B viraria a da C).
 */
export function adicionarOpcao(atual: TranscribedQuestion): TranscribedQuestion {
  if (atual.options.length >= MAX_OPTIONS) return atual;
  return {
    ...atual,
    options: [...atual.options, ''],
    optionExplanations: [...atual.optionExplanations, ''],
  };
}

/**
 * Remove a alternativa e a justificativa do **mesmo** índice e reposiciona o
 * gabarito: sai a correta (o gabarito volta ao início) ou sai alguma coisa
 * antes dela (o gabarito anda uma posição para trás).
 */
export function removerOpcao(atual: TranscribedQuestion, index: number): TranscribedQuestion {
  if (index < 0 || index >= atual.options.length) return atual;
  if (atual.options.length <= MIN_OPTIONS) return atual;
  const options = atual.options.filter((_, i) => i !== index);
  const optionExplanations = atual.optionExplanations.filter((_, i) => i !== index);
  const correctIndex =
    atual.correctIndex === index
      ? 0
      : atual.correctIndex > index
        ? atual.correctIndex - 1
        : atual.correctIndex;
  return { ...atual, options, optionExplanations, correctIndex };
}

/** Mensagem de erro do formulário, ou null quando está tudo preenchido. */
export function validarTranscricao(value: TranscribedQuestion): string | null {
  if (value.subject.trim().length < 2) {
    return 'Informe a disciplina (mínimo 2 letras).';
  }
  if (value.stem.trim().length < MIN_STEM) {
    return `O enunciado precisa de pelo menos ${MIN_STEM} caracteres.`;
  }
  const filled = value.options.map((option) => option.trim()).filter(Boolean);
  if (filled.length < MIN_OPTIONS) {
    return `Transcreva pelo menos ${MIN_OPTIONS} alternativas.`;
  }
  if (!value.options[value.correctIndex]?.trim()) {
    return 'Marque qual alternativa está correta.';
  }
  return null;
}

/**
 * Recorte final, na hora de salvar: alternativa em branco no meio da lista é
 * descartada e a justificativa acompanha a alternativa que sobreviveu. Sem
 * isso, a alternativa vazia viraria questão e a justificativa de uma
 * alternativa seria gravada na outra.
 */
export function prepararTranscricaoParaEnvio(
  value: TranscribedQuestion,
): TranscribedQuestion {
  const kept = value.options
    .map((option, index) => ({ text: option.trim(), index }))
    .filter(({ text }) => text.length > 0);
  return {
    ...value,
    subject: value.subject.trim(),
    topic: value.topic.trim(),
    exam: value.exam.trim(),
    stem: value.stem.trim(),
    explanation: value.explanation.trim(),
    options: kept.map(({ text }) => text),
    optionExplanations: kept.map(
      ({ index }) => value.optionExplanations[index]?.trim() ?? '',
    ),
    correctIndex: kept.findIndex(({ index }) => index === value.correctIndex),
  };
}
