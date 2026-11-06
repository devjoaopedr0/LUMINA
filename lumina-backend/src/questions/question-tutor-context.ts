/**
 * Contexto que a LuminIA recebe quando o aluno pede ajuda em uma questão.
 *
 * Função pura: não consulta o banco nem chama a IA. O serviço busca a questão
 * acessível e a última tentativa; aqui só montamos o texto que entra como
 * mensagem de sistema. A regra central é não entregar o gabarito antes de o
 * aluno responder — o contexto muda de instrução depois da tentativa.
 */

export interface TutorQuestion {
  subject: string;
  topic: string;
  exam: string;
  year: number | null;
  difficulty: string;
  stem: string;
  imageUrl?: string | null;
  explanation: string | null;
  alternatives: {
    text: string;
    position: number;
    isCorrect: boolean;
    explanation: string | null;
  }[];
}

export interface TutorAttempt {
  selectedPosition: number;
  isCorrect: boolean;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function tutorPositionLetter(position: number): string {
  return LETTERS[position - 1] ?? '?';
}

function alternativesBlock(question: TutorQuestion, revealAnswer: boolean): string[] {
  const ordered = [...question.alternatives].sort((a, b) => a.position - b.position);
  return ordered.map((alternative) => {
    const correct = revealAnswer && alternative.isCorrect ? ' (correta)' : '';
    return `${tutorPositionLetter(alternative.position)}) ${alternative.text}${correct}`;
  });
}

/**
 * Monta o contexto em duas partes: os dados da questão e a instrução de como
 * usá-los. Sem tentativa registrada, nem a alternativa correta nem o
 * comentário do gabarito entram no texto — assim a IA não vaza a resposta por
 * acidente ao reformular o enunciado.
 */
export function buildQuestionTutorContext(
  question: TutorQuestion,
  attempt: TutorAttempt | null,
): string {
  const answered = attempt !== null;
  const lines = [
    'CONTEXTO DA QUESTÃO (dados do sistema; use somente o que está aqui e não invente):',
    `Disciplina: ${question.subject}`,
    question.topic ? `Assunto: ${question.topic}` : null,
    question.exam
      ? `Prova: ${question.exam}${question.year ? ` (${question.year})` : ''}`
      : null,
    `Dificuldade: ${question.difficulty}`,
    `Enunciado:\n${question.stem}`,
    'Alternativas:',
    ...alternativesBlock(question, answered),
  ].filter((line): line is string => line !== null);

  if (question.imageUrl) {
    lines.push(
      'A questão tem uma imagem que o aluno vê na tela. Você não recebeu a imagem: não invente detalhes visuais; se a resposta depender dela, diga o que o aluno precisa observar.',
    );
  }

  if (!answered) {
    lines.push(
      '',
      'O aluno ainda não respondeu esta questão. NÃO diga qual alternativa é a correta, não confirme a escolha dele e não use o comentário do gabarito. Ajude com o raciocínio: destaque o que o enunciado pede, o conceito envolvido e como eliminar distratores.',
    );
    return lines.join('\n');
  }

  const correct = question.alternatives.find((alternative) => alternative.isCorrect);
  const selected = question.alternatives.find(
    (alternative) => alternative.position === attempt.selectedPosition,
  );

  lines.push('', 'O aluno já respondeu esta questão.');
  if (correct) {
    lines.push(
      `Alternativa correta: ${tutorPositionLetter(correct.position)}) ${correct.text}`,
    );
  }
  lines.push(
    selected
      ? `Alternativa marcada pelo aluno: ${tutorPositionLetter(selected.position)}) ${selected.text}`
      : `Alternativa marcada pelo aluno: posição ${attempt.selectedPosition}`,
    `Resultado: ${attempt.isCorrect ? 'acertou' : 'errou'}.`,
  );

  if (question.explanation?.trim()) {
    lines.push(`Comentário do gabarito: ${question.explanation.trim()}`);
  }

  const explained = question.alternatives
    .filter((alternative) => alternative.explanation?.trim())
    .sort((a, b) => a.position - b.position);
  if (explained.length > 0) {
    lines.push('Comentários por alternativa:');
    for (const alternative of explained) {
      lines.push(
        `${tutorPositionLetter(alternative.position)}) ${alternative.explanation?.trim()}`,
      );
    }
  }

  lines.push(
    '',
    attempt.isCorrect
      ? 'Explique por que a resposta do aluno está correta e reforce o conceito. Termine com uma forma rápida de fixar o aprendizado.'
      : 'Mostre onde o raciocínio do aluno tropeçou, sem julgamento, e explique o caminho até a alternativa correta. Termine com um próximo passo pequeno.',
  );

  return lines.join('\n');
}
