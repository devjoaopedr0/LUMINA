/**
 * Leitura de questão impressa (foto ou print) com modelo de visão.
 *
 * Substitui o OCR simulado do scanner de questões (item 18). Regras:
 * 1. Transcrever o enunciado e as alternativas como estão, sem resolver,
 *    sem corrigir e sem completar o que não dá para ler (vira [ilegível]).
 * 2. Figura, gráfico ou tabela que não vira texto é sinalizada: a questão
 *    pode depender dela, e o aluno confere antes de salvar.
 * 3. A leitura não sabe qual alternativa é a correta: quem marca é o aluno.
 *    Por isso não há "explicação por alternativa" nesta etapa.
 */
import { QuestionDifficulty } from '@prisma/client';
import { extractJson } from '../essay-correction/grading/essay-grader';

export const QUESTION_OCR_PROMPT_VERSION = 'questao-ocr-v1';

export const QUESTION_SUBJECTS = [
  'Matemática',
  'Física',
  'Química',
  'Biologia',
  'Língua Portuguesa',
  'Literatura',
  'Inglês',
  'Espanhol',
  'Artes',
  'Educação Física',
  'História',
  'Geografia',
  'Filosofia',
  'Sociologia',
] as const;

export const QUESTION_OCR_SYSTEM = `Você transcreve questões de prova (ENEM e vestibulares) a partir de fotos ou prints.
Regras:
- Transcreva o enunciado e as alternativas EXATAMENTE como estão na imagem: não resolva, não corrija, não resuma e não complete trechos.
- Palavra ou número que não dá para ler vira [ilegível]. Nunca invente.
- Fórmulas: escreva em texto simples (ex.: x^2, raiz(3), H2O, 10^5).
- Se houver figura, gráfico, tabela, mapa ou charge, marque "tem_figura": true e, em "figura", descreva em uma frase o que ela mostra, copiando apenas valores que estejam legíveis.
- Se a imagem tiver mais de uma questão, transcreva só a primeira completa e avise em "observacoes".
- Classifique a disciplina (uma da lista), o assunto (curto) e a dificuldade (FACIL, MEDIA ou DIFICIL) pelo conteúdo.
Responda APENAS com JSON válido.`;

export const QUESTION_OCR_PROMPT = `Formato:
{"legivel": true,
 "enunciado": "texto do enunciado, com os parágrafos separados por \\n",
 "alternativas": [{"letra": "A", "texto": "..."}],
 "tem_figura": false,
 "figura": null,
 "disciplina": "uma de: ${QUESTION_SUBJECTS.join(', ')}",
 "assunto": "assunto curto",
 "dificuldade": "MEDIA",
 "confianca": 0.0,
 "observacoes": "problemas da foto, se houver (borrão, corte, reflexo) ou null"}
"confianca" é sua estimativa (0 a 1) de que a transcrição está fiel. Se a foto não mostrar uma questão legível, devolva {"legivel": false, "observacoes": "motivo"}.`;

export interface QuestionOcrResult {
  stemText: string;
  alternatives: { position: number; text: string }[];
  subject: string | null;
  topic: string | null;
  difficulty: QuestionDifficulty | null;
  confidence: number;
  hasFigure: boolean;
  warnings: string[];
}

export class QuestionNotReadableError extends Error {}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const ILLEGIBLE = /\[ileg[ií]vel\]/gi;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const strip = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Disciplina da lista (aceita sem acento ou com variações comuns); fora dela, null. */
export function normalizeSubject(raw: string): string | null {
  const wanted = strip(raw);
  if (!wanted) return null;
  const aliases: Record<string, string> = { portugues: 'Língua Portuguesa', 'lingua portuguesa': 'Língua Portuguesa', ingles: 'Inglês', espanhol: 'Espanhol', matematica: 'Matemática' };
  if (aliases[wanted]) return aliases[wanted];
  return QUESTION_SUBJECTS.find((subject) => strip(subject) === wanted) ?? null;
}

/**
 * Lê a resposta do modelo. Lança QuestionNotReadableError quando a foto não
 * tem uma questão legível (o aluno tenta outra foto) e devolve avisos para o
 * que precisa de conferência.
 */
export function parseQuestionOcr(raw: string): QuestionOcrResult {
  let data: Record<string, unknown>;
  try {
    data = extractJson(raw) as Record<string, unknown>;
  } catch {
    throw new Error('A leitura devolveu uma resposta que não deu para interpretar. Tente de novo.');
  }
  const notes = text(data.observacoes, 400);
  // Cabeçalho da prova ("QUESTÃO 97", "Questão 12 –") não faz parte do enunciado.
  const stem = text(data.enunciado, 8000).replace(/^quest[ãa]o\s*\d+\s*[-–—:.]?\s*/i, '').trim();
  if (data.legivel === false || stem.length < 15) {
    throw new QuestionNotReadableError(notes ? `Não deu para ler uma questão nesta foto: ${notes}` : 'Não deu para ler uma questão nesta foto. Tente uma foto mais nítida, de frente e com a questão inteira.');
  }

  const seen = new Set<number>();
  const alternatives = (Array.isArray(data.alternativas) ? data.alternativas : [])
    .map((item, index) => {
      const entry = item as Record<string, unknown>;
      // Sem letra, vale a ordem; com letra fora de A–E, a alternativa é descartada.
      const rawLetter = text(entry?.letra, 3).toUpperCase().replace(/[^A-Z]/g, '');
      const position = rawLetter ? LETTERS.indexOf(rawLetter) + 1 : index + 1;
      return { position, text: text(entry?.texto, 2000) };
    })
    .filter((alt) => alt.position >= 1 && alt.position <= 5 && alt.text && !seen.has(alt.position) && seen.add(alt.position))
    .sort((a, b) => a.position - b.position);

  const hasFigure = data.tem_figura === true;
  const figure = hasFigure ? text(data.figura, 600) : '';
  const stemText = figure ? `${stem}\n\n[Figura: ${figure}]` : stem;

  const difficultyRaw = text(data.dificuldade, 10).toUpperCase();
  const difficulty = (['FACIL', 'MEDIA', 'DIFICIL'] as const).find((d) => d === difficultyRaw) ?? null;
  const rawConfidence = typeof data.confianca === 'number' && Number.isFinite(data.confianca) ? Math.min(1, Math.max(0, data.confianca)) : 0.5;
  const illegible = (stemText.match(ILLEGIBLE)?.length ?? 0) + alternatives.reduce((sum, alt) => sum + (alt.text.match(ILLEGIBLE)?.length ?? 0), 0);
  // A confiança do modelo cai com cada trecho ilegível e com alternativas faltando.
  const missingAlternatives = alternatives.length >= 2 ? Math.max(0, 5 - alternatives.length) : 5;
  const confidence = Math.max(0, Math.round((rawConfidence - illegible * 0.05 - missingAlternatives * 0.05) * 100) / 100);

  const warnings: string[] = [];
  if (alternatives.length < 2) warnings.push('Não foram encontradas alternativas: confira se a foto mostra a questão inteira ou digite as alternativas.');
  else if (alternatives.length < 5) warnings.push(`Foram lidas ${alternatives.length} alternativas: confira se alguma ficou de fora da foto.`);
  if (hasFigure) warnings.push('A questão tem figura, gráfico ou tabela. A descrição entrou no enunciado entre colchetes: confira, porque a resposta pode depender da imagem.');
  if (illegible) warnings.push(`${illegible} trecho(s) ficaram como [ilegível]: corrija antes de salvar.`);
  if (confidence < 0.7) warnings.push('Confiança baixa na leitura: compare o texto com a foto antes de salvar.');
  if (notes) warnings.push(`Observação da leitura: ${notes}`);

  return {
    stemText,
    alternatives,
    subject: normalizeSubject(text(data.disciplina, 60)),
    topic: text(data.assunto, 160) || null,
    difficulty,
    confidence,
    hasFigure,
    warnings,
  };
}
