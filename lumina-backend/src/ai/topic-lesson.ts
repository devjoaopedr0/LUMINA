import type { TopicLevel } from '../schedules/topic-sequence';

/**
 * Resumo de teoria de um tópico, para a tarefa de "Teoria" do cronograma ter
 * o que estudar dentro do app. O texto é gerado uma vez por tópico e guardado
 * (TopicLesson): o resumo é o mesmo para todos os alunos, então não faz
 * sentido pagar a geração a cada abertura.
 */

/** Seções que todo resumo tem, nesta ordem — a tela conta com os títulos. */
export const LESSON_SECTIONS = [
  'Em poucas palavras',
  'O que você precisa saber',
  'Exemplo resolvido',
  'Erros comuns',
  'Como cai no ENEM',
] as const;

const LEVEL_GUIDANCE: Record<TopicLevel, string> = {
  BASE: 'É um tópico de base: explique do zero, sem supor que o aluno já viu o assunto.',
  INTERMEDIARIO: 'É um tópico intermediário: pode supor a base da matéria, mas relembre em uma frase o que for usar.',
  AVANCADO: 'É um tópico avançado: aponte de quais conteúdos anteriores ele depende e relembre o essencial deles.',
};

export const LESSON_SYSTEM_PROMPT = `Você escreve resumos de teoria para estudantes brasileiros do ensino médio que se preparam para o ENEM, dentro do app Lumina.

Regras de conteúdo:
- Escreva só o que é consenso em livro didático do ensino médio. Na dúvida sobre um dado (data, valor, nome), deixe de fora em vez de arriscar.
- Não cite questões, anos de prova nem estatísticas de incidência específicas: fale de como o assunto costuma ser cobrado, em termos gerais.
- Não invente citações nem atribua falas a pessoas reais; se precisar de um trecho para analisar, descreva a situação com as suas palavras.
- Linguagem direta e próxima, em português do Brasil, sem enrolação e sem tom de enciclopédia.

Regras de formato (siga exatamente):
- Use exatamente estas seções, nesta ordem, cada uma numa linha começando com "## ": ${LESSON_SECTIONS.join(' | ')}.
- "Em poucas palavras": 2 ou 3 frases.
- "O que você precisa saber": de 4 a 6 itens em lista, cada linha começando com "- ".
- "Exemplo resolvido": um exemplo concreto, passo a passo (em matérias sem cálculo, a análise de uma situação ou de um trecho curto).
- "Erros comuns": 2 ou 3 itens em lista.
- "Como cai no ENEM": 2 ou 3 frases e, na última linha, uma pergunta curta para o aluno testar se entendeu.
- Pode usar **negrito** em termos-chave. Não use tabelas, LaTeX, blocos de código nem outros títulos. Escreva fórmulas em texto simples (ex.: v = d / t).
- Entre 300 e 450 palavras no total. Não escreva nada antes da primeira seção nem depois da última.`;

export function lessonUserPrompt(params: {
  subjectName: string;
  topicName: string;
  level: TopicLevel | null;
}): string {
  return [
    `Escreva o resumo de teoria do tópico "${params.topicName}", de ${params.subjectName}.`,
    params.level ? LEVEL_GUIDANCE[params.level] : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

/**
 * Limpa e confere o texto do modelo. Devolve null quando ele não segue a
 * estrutura — nesse caso o resumo NÃO é guardado: melhor o aluno ver "tente de
 * novo" do que um texto quebrado ficar salvo para todo mundo.
 */
export function parseLesson(raw: string): string | null {
  const text = raw
    .replace(/\r\n/g, '\n')
    // Alguns modelos embrulham a resposta num bloco de código.
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();
  const start = text.indexOf('## ');
  if (start === -1) return null;
  const content = text.slice(start).trim();

  const headings = content
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim().replace(/[:.]$/, '').toLowerCase());
  const hasAllSections = LESSON_SECTIONS.every((section) => headings.includes(section.toLowerCase()));
  if (!hasAllSections || content.length < 600) return null;
  return content;
}
