import { QuestionDifficulty } from '@prisma/client';
import { WebSearchHit, WebSearchHitClassification, WebSearchQuery } from './search-provider.interface';

/** Classificação DETERMINÍSTICA de resultados da web (heurística + catálogo,
 * nunca IA externa): disciplina, assunto, prova e ano a partir do título, do
 * trecho e do endereço do resultado, cruzados com o catálogo da Lumina.
 *
 * Tudo aqui é função pura — o catálogo chega pronto (ver
 * WebHitClassifierService) — para os testes cobrirem cada regra. */

export interface CatalogSubject {
  id: string;
  name: string;
  topics: { id: string; name: string }[];
}

export interface CatalogExam {
  id: string;
  name: string;
  year: number | null;
}

export interface ClassifierCatalog {
  subjects: CatalogSubject[];
  exams: CatalogExam[];
}

/** Assuntos genéricos demais para identificar uma questão. */
const IGNORED_TOPICS = new Set(['geral', 'outro', 'outros', 'diverso', 'diversos']);

/** Outras formas de escrever a disciplina, pelo nome do catálogo. */
const SUBJECT_ALIASES: Record<string, string[]> = {
  'Língua Portuguesa': ['português', 'gramática'],
  Artes: ['arte'],
};

/** Formas comuns de escrever um assunto que não batem com o nome do
 * catálogo, pelo nome do catálogo; só valem se o assunto existir. */
const TOPIC_ALIASES: Record<string, string[]> = {
  'Função afim': ['função do 1º grau', 'função de primeiro grau', 'função polinomial do 1º grau', 'função linear'],
  'Função quadrática': ['função do 2º grau', 'função de segundo grau', 'função polinomial do 2º grau', 'parábola'],
  'Equação do 2º grau': ['bhaskara', 'báskara'],
  'Análise combinatória': ['permutação', 'arranjo simples', 'combinação simples'],
  'Segunda Guerra Mundial': ['2ª Guerra Mundial', 'II Guerra Mundial'],
  Genética: ['lei de Mendel', 'leis de Mendel', 'mendeliana'],
};

/** Nome do catálogo + apelidos, já normalizados em sequências de tokens. */
function aliasesFor(table: Record<string, string[]>, name: string): string[][] {
  const key = normalizePhrase(name);
  const entry = Object.entries(table).find(([k]) => normalizePhrase(k) === key);
  return [key, ...(entry?.[1] ?? []).map(normalizePhrase)].filter(Boolean).map((p) => p.split(' '));
}

const ORDINALS: Record<string, string> = { primeiro: '1', primeira: '1', segundo: '2', segunda: '2', terceiro: '3', terceira: '3' };

/** Reduz plural/singular a uma forma comum ("funções" → "funcao"). */
function stem(token: string): string {
  if (token.length <= 3 || /^\d+$/.test(token)) return token;
  return token
    .replace(/oes$/, 'ao')
    .replace(/aes$/, 'ao')
    .replace(/ais$/, 'al')
    .replace(/eis$/, 'el')
    .replace(/ns$/, 'm')
    .replace(/s$/, '');
}

/** Minúsculas, sem acento, sem pontuação, ordinais e plurais normalizados. */
export function normalizeTokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d)\s*[ºª°]/g, '$1 ')
    .replace(/(\d)o\b/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((token) => ORDINALS[token] ?? token)
    .map(stem);
}

export function normalizePhrase(text: string): string {
  return normalizeTokens(text).join(' ');
}

/** Posição da frase (sequência de tokens) no texto, ou -1. */
function phraseIndex(haystack: string[], phrase: string[]): number {
  if (phrase.length === 0 || phrase.length > haystack.length) return -1;
  outer: for (let i = 0; i <= haystack.length - phrase.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (haystack[i + j] !== phrase[j]) continue outer;
    return i;
  }
  return -1;
}

function countPhrase(haystack: string[], phrase: string[]): number {
  let count = 0;
  for (let i = 0; i <= haystack.length - phrase.length; i++) {
    if (phrase.every((token, j) => haystack[i + j] === token)) count++;
  }
  return count;
}

/** Texto que descreve o resultado: título, trecho e o caminho da URL. */
export function hitText(hit: Pick<WebSearchHit, 'title' | 'snippet' | 'link'>): { title: string[]; all: string[] } {
  let path = '';
  try {
    path = decodeURIComponent(new URL(hit.link).pathname).replace(/[-_/.]+/g, ' ');
  } catch {
    path = '';
  }
  const title = normalizeTokens(hit.title ?? '');
  return { title, all: [...title, '|', ...normalizeTokens(hit.snippet ?? ''), '|', ...normalizeTokens(path)] };
}

function findSubject(catalog: ClassifierCatalog, name: string | null | undefined): CatalogSubject | null {
  if (!name) return null;
  const wanted = normalizePhrase(name);
  return catalog.subjects.find((s) => normalizePhrase(s.name) === wanted) ?? null;
}

/** Disciplina mais citada no texto (nome ou apelido). Empate = nenhuma. */
function detectSubject(catalog: ClassifierCatalog, tokens: string[]): CatalogSubject | null {
  const scored = catalog.subjects
    .map((subject) => {
      const phrases = aliasesFor(SUBJECT_ALIASES, subject.name);
      return { subject, score: phrases.reduce((sum, p) => sum + countPhrase(tokens, p), 0) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0 || (scored[1] && scored[1].score === scored[0].score)) return null;
  return scored[0].subject;
}

interface TopicMatch {
  subject: CatalogSubject;
  topic: { id: string; name: string };
  tokens: number;
  inTitle: boolean;
}

/** Palavras que indicam página de questões/estudo (já normalizadas). */
const STUDY_CONTEXT = new Set(['questao', 'exercicio', 'vestibular', 'simulado', 'gabarito', 'resolvida', 'resolucao', 'enem']);

function hasStudyContext(tokens: string[]): boolean {
  return tokens.some((token) => STUDY_CONTEXT.has(token));
}

/** Assunto do catálogo citado no texto. Prefere o que aparece no título e o
 * mais específico (mais palavras). Assunto de UMA palavra ("Conjuntos",
 * "Evolução") só conta com a disciplina definida (filtro ou texto) ou com
 * contexto de questão na página — solto, é comum demais para decidir. */
function detectTopic(
  catalog: ClassifierCatalog,
  text: { title: string[]; all: string[] },
  subject: CatalogSubject | null,
): TopicMatch | null {
  const singleWordAllowed = Boolean(subject) || hasStudyContext(text.all);
  const subjects = subject ? [subject] : catalog.subjects;
  const matches: TopicMatch[] = [];
  for (const s of subjects) {
    for (const topic of s.topics) {
      const key = normalizePhrase(topic.name);
      if (!key || IGNORED_TOPICS.has(key)) continue;
      const phrases = aliasesFor(TOPIC_ALIASES, topic.name);
      const found = phrases.find((p) => phraseIndex(text.all, p) >= 0);
      if (!found) continue;
      if (found.length === 1 && !singleWordAllowed) continue;
      matches.push({ subject: s, topic, tokens: found.length, inTitle: phraseIndex(text.title, found) >= 0 });
    }
  }
  matches.sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || b.tokens - a.tokens);
  return matches[0] ?? null;
}

const MIN_YEAR = 1998;

function isYear(token: string, maxYear: number): boolean {
  if (!/^(19|20)\d{2}$/.test(token)) return false;
  const year = Number(token);
  return year >= MIN_YEAR && year <= maxYear;
}

/** Prova citada no texto (nome do catálogo) e o ano escrito logo depois dela. */
function detectExam(
  catalog: ClassifierCatalog,
  text: { title: string[]; all: string[] },
  maxYear: number,
): { name: string; year: number | null } | null {
  // Nomes com dígito são resíduos de testes no catálogo (ex.: "DEBUG12").
  const names = [...new Set(catalog.exams.map((e) => e.name).filter((n) => n.length >= 3 && !/\d/.test(n)))];
  let best: { name: string; index: number; inTitle: boolean } | null = null;
  for (const name of names) {
    const phrase = normalizeTokens(name);
    const inTitle = phraseIndex(text.title, phrase);
    const index = inTitle >= 0 ? inTitle : phraseIndex(text.all, phrase);
    if (index < 0) continue;
    const candidate = { name, index, inTitle: inTitle >= 0 };
    if (!best || (candidate.inTitle && !best.inTitle) || (candidate.inTitle === best.inTitle && candidate.index < best.index)) {
      best = candidate;
    }
  }
  if (!best) return null;

  const tokens = best.inTitle ? text.title : text.all;
  const length = normalizeTokens(best.name).length;
  // Ano até 3 palavras depois do nome: "ENEM 2021", "Enem (2021)", "ENEM – PPL 2019".
  for (let i = best.index + length; i < Math.min(tokens.length, best.index + length + 3); i++) {
    if (isYear(tokens[i], maxYear)) return { name: best.name, year: Number(tokens[i]) };
  }
  // Senão, um único ano no título vale.
  const titleYears = [...new Set(text.title.filter((t) => isYear(t, maxYear)))];
  return { name: best.name, year: titleYears.length === 1 ? Number(titleYears[0]) : null };
}

/** Classifica um resultado. Filtros que o aluno escolheu (disciplina, prova,
 * dificuldade) valem como parâmetro quando o texto não diz o contrário. */
export function classifyWebHit(
  hit: Pick<WebSearchHit, 'title' | 'snippet' | 'link'>,
  query: WebSearchQuery,
  catalog: ClassifierCatalog,
  now = new Date(),
): WebSearchHitClassification | null {
  const text = hitText(hit);
  const maxYear = now.getFullYear() + 1;

  const requestedSubject = findSubject(catalog, query.subject);
  const textSubject = requestedSubject ?? detectSubject(catalog, text.all);
  const topic = detectTopic(catalog, text, textSubject);
  const subject = requestedSubject ?? topic?.subject ?? textSubject;

  const exam = detectExam(catalog, text, maxYear);
  const examName = exam?.name ?? query.exam ?? null;
  const year = exam?.year ?? null;
  const examRecord = examName && year
    ? catalog.exams.find((e) => normalizePhrase(e.name) === normalizePhrase(examName) && e.year === year) ?? null
    : null;

  const classification: WebSearchHitClassification = {
    subject: subject?.name ?? null,
    subjectId: subject?.id ?? null,
    topic: topic?.topic.name ?? null,
    topicId: topic?.topic.id ?? null,
    exam: examRecord?.name ?? examName,
    examId: examRecord?.id ?? null,
    year,
    difficulty: (query.difficulty as QuestionDifficulty | null | undefined) ?? null,
  };
  const hasSomething = Object.values(classification).some((value) => value !== null && value !== undefined);
  return hasSomething ? classification : null;
}

/** Quanto o resultado bate com os filtros pedidos — sobe os mais aderentes. */
export function relevanceToQuery(classification: WebSearchHitClassification | null | undefined, query: WebSearchQuery): number {
  if (!classification) return 0;
  const same = (a?: string | null, b?: string | null) => Boolean(a && b && normalizePhrase(a) === normalizePhrase(b));
  let score = 0;
  if (query.topic && same(classification.topic, query.topic)) score += 3;
  if (query.exam && same(classification.exam, query.exam)) score += 2;
  if (classification.topic) score += 1;
  if (classification.year) score += 1;
  return score;
}
