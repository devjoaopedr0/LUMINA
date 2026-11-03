/**
 * Análise determinística da redação — o que dá para medir sem IA.
 *
 * Serve a três consumidores: (1) a ferramenta `analisar_redacao` do MCP, que
 * a IA corretora chama antes de dar nota; (2) as consultas do RAG, montadas a
 * partir dos problemas encontrados aqui; (3) o modelo de atributos treinado
 * com redações já avaliadas (feature-model.ts).
 *
 * Nada aqui dá nota sozinho: são sinais. Ex.: "nenhum agente encontrado na
 * proposta" é um alerta para o corretor conferir, não um zero automático.
 */
import { stem, stripAccents, tokenize } from '../rag/bm25';

/** Caracteres por linha na folha oficial do Enem com letra manuscrita média. */
export const CHARS_PER_HANDWRITTEN_LINE = 62;
export const MIN_LINES = 8;
export const MAX_LINES = 30;

type ConnectiveRelation =
  | 'adicao'
  | 'oposicao'
  | 'causa'
  | 'consequencia'
  | 'conclusao'
  | 'exemplificacao'
  | 'tempo'
  | 'finalidade'
  | 'comparacao'
  | 'retomada';

const CONNECTIVES: Record<ConnectiveRelation, string[]> = {
  adicao: ['além disso', 'ademais', 'outrossim', 'também', 'não só', 'mas também', 'bem como', 'somado a isso', 'acrescenta-se', 'em adição'],
  oposicao: ['entretanto', 'contudo', 'todavia', 'no entanto', 'porém', 'embora', 'apesar de', 'não obstante', 'em contrapartida', 'ainda que', 'mesmo que'],
  causa: ['porque', 'visto que', 'uma vez que', 'já que', 'dado que', 'devido a', 'em virtude de', 'em razão de', 'haja vista'],
  consequencia: ['por isso', 'dessa forma', 'desse modo', 'consequentemente', 'por conseguinte', 'de modo que', 'de forma que', 'assim sendo', 'logo'],
  conclusao: ['portanto', 'em suma', 'enfim', 'diante disso', 'diante do exposto', 'em síntese', 'conclui-se', 'dessarte', 'destarte', 'por fim'],
  exemplificacao: ['por exemplo', 'a exemplo de', 'como exemplo', 'tal como', 'isto é', 'ou seja', 'como ocorre'],
  tempo: ['primeiramente', 'em primeiro lugar', 'em segundo lugar', 'inicialmente', 'atualmente', 'posteriormente', 'nesse momento', 'historicamente'],
  finalidade: ['a fim de', 'para que', 'com o objetivo de', 'com o intuito de', 'com a finalidade de', 'visando', 'de modo a'],
  comparacao: ['assim como', 'tal qual', 'da mesma forma', 'analogamente', 'similarmente'],
  retomada: ['nesse sentido', 'nesse contexto', 'nessa perspectiva', 'sob esse viés', 'nessa lógica', 'tal cenário', 'essa conjuntura', 'esse quadro', 'tal problemática', 'essa problemática'],
};

const AGENTS = [
  'governo', 'governo federal', 'estado', 'poder público', 'poder executivo', 'poder legislativo', 'congresso', 'ministério',
  'secretaria', 'prefeitura', 'prefeituras', 'municípios', 'escola', 'escolas', 'instituições de ensino', 'universidades',
  'mídia', 'imprensa', 'meios de comunicação', 'redes sociais', 'ongs', 'organizações não governamentais', 'sociedade civil',
  'família', 'famílias', 'empresas', 'iniciativa privada', 'igrejas', 'comunidade', 'cidadãos', 'população', 'sociedade',
  'judiciário', 'ministério público', 'inep', 'mec', 'sus', 'anvisa', 'ibama', 'conselho', 'órgãos',
];
const ACTION_MARKERS = [
  'deve', 'devem', 'deverá', 'deverão', 'cabe ao', 'cabe à', 'cabe aos', 'compete ao', 'compete à', 'é necessário que',
  'é preciso que', 'é fundamental que', 'é imprescindível que', 'urge que', 'faz-se necessário', 'precisa', 'precisam',
  'necessita', 'necessitam', 'é dever', 'propõe-se', 'sugere-se',
];
const MEANS_MARKERS = ['por meio de', 'por meio da', 'por meio do', 'mediante', 'através de', 'através da', 'através do', 'por intermédio', 'com o uso de', 'com a criação de', 'com a implementação de', 'via'];
const PURPOSE_MARKERS = ['a fim de', 'para que', 'com o objetivo de', 'com o intuito de', 'com a finalidade de', 'visando', 'de modo a', 'de forma a', 'para garantir', 'para reduzir', 'para combater', 'para promover', 'para ampliar', 'para mitigar'];
const DETAIL_MARKERS = ['por exemplo', 'como ', 'tais como', 'isto é', 'ou seja', 'que ', 'o qual', 'a qual', 'cujo', 'cuja', '('];

const INFORMAL_MARKERS = ['vc', 'você', 'vocês', 'pq', 'tipo assim', 'né', 'a gente', 'tá', 'pra', 'pro', 'beleza', 'galera', 'cara', 'muito top', 'tbm', 'eu acho', 'na minha opinião', 'eu penso'];
const HUMAN_RIGHTS_FLAGS = [
  'pena de morte', 'tortura', 'torturar', 'justiça com as próprias mãos', 'linchamento', 'linchar', 'castração', 'castrar',
  'exterminar', 'extermínio', 'eliminar esses', 'matar', 'esterilização forçada', 'prisão perpétua', 'trabalho forçado',
  'mutilação', 'execução sumária',
];
const DISCONNECTED_FLAGS = ['corretor', 'corretora', 'banca avaliadora', 'cara banca', 'prezado avaliador', 'deus me ajude', 'me dê nota', 'não sei escrever', 'estou nervoso', 'estou nervosa', 'fim da redação', 'obrigado pela leitura'];
const IDENTIFICATION_FLAGS = ['atenciosamente', 'assinado', 'meu nome é', 'assinatura'];

export interface ProposalAnalysis {
  /** Parágrafo onde a proposta mais completa foi encontrada (1 = primeiro); null se nenhum. */
  paragraph: number | null;
  elements: {
    acao: string | null;
    agente: string | null;
    meio: string | null;
    finalidade: string | null;
    detalhamento: string | null;
  };
  count: number;
}

export interface EssayTextAnalysis {
  characters: number;
  words: number;
  paragraphs: number;
  sentences: number;
  /** Linhas na folha: as do OCR quando houver, senão estimadas pelo tamanho do texto. */
  lines: number;
  linesSource: 'ocr' | 'estimativa';
  avgSentenceWords: number;
  longestSentenceWords: number;
  /** Proporção de palavras distintas (radicais) — variedade vocabular. */
  lexicalDiversity: number;
  connectives: {
    total: number;
    distinct: number;
    byRelation: Partial<Record<ConnectiveRelation, string[]>>;
    /** Conectivo usado 3+ vezes — "repertório pouco diversificado" na C4. */
    overused: string[];
    /** Parágrafos (a partir do 2º) que não começam com elemento de ligação. */
    paragraphsWithoutLink: number[];
  };
  repeatedWords: { word: string; count: number }[];
  informalMarkers: string[];
  proposal: ProposalAnalysis;
  humanRightsFlags: string[];
  /** Cobertura dos termos do tema no texto (0–1); null sem tema. */
  themeCoverage: number | null;
  themeTermsMissing: string[];
  zeroRisks: { code: 'TEXTO_INSUFICIENTE' | 'EM_BRANCO' | 'PARTE_DESCONECTADA' | 'IDENTIFICACAO' | 'FUGA_AO_TEMA'; detail: string }[];
  /** Avisos que viram consulta do RAG e conferência do corretor. */
  warnings: string[];
}

function normalizeForMatch(text: string): string {
  return ` ${stripAccents(text.toLowerCase()).replace(/\s+/g, ' ')} `;
}

function countOccurrences(haystack: string, needle: string): number {
  const n = normalizeForMatch(needle).trim();
  if (!n) return 0;
  const pattern = new RegExp(`(?<![a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'g');
  return (haystack.match(pattern) ?? []).length;
}

function firstMatch(text: string, markers: string[]): string | null {
  const normalized = normalizeForMatch(text);
  let best: { marker: string; index: number } | null = null;
  for (const marker of markers) {
    const m = normalizeForMatch(marker).trim();
    const pattern = new RegExp(`(?<![a-z0-9])${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    const found = pattern.exec(normalized);
    if (found && (!best || found.index < best.index)) best = { marker, index: found.index };
  }
  return best?.marker ?? null;
}

export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n|\n(?=\s{2,}|\t)/)
    .flatMap((block) => (block.includes('\n') && !/\n\s*\n/.test(block) ? [block.replace(/\n/g, ' ')] : [block]))
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú"“(])/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}]/u.test(s));
}

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;
}

function analyzeProposal(paragraphs: string[]): ProposalAnalysis {
  // A proposta mora, quase sempre, na conclusão; mas há quem a antecipe. Olha
  // os dois últimos parágrafos e fica com o mais completo.
  const candidates = paragraphs.map((text, index) => ({ text, index })).slice(-2).reverse();
  let best: ProposalAnalysis = { paragraph: null, elements: { acao: null, agente: null, meio: null, finalidade: null, detalhamento: null }, count: 0 };
  for (const { text, index } of candidates) {
    const acao = firstMatch(text, ACTION_MARKERS);
    const agente = firstMatch(text, AGENTS);
    const meio = firstMatch(text, MEANS_MARKERS);
    const finalidade = firstMatch(text, PURPOSE_MARKERS);
    // Detalhamento só conta quando já há ação: é detalhe DE algo.
    const detalhamento = acao && (agente || meio || finalidade) ? firstMatch(text.slice(text.length / 3), DETAIL_MARKERS) : null;
    const elements = { acao, agente, meio, finalidade, detalhamento };
    const count = Object.values(elements).filter(Boolean).length;
    if (count > best.count) best = { paragraph: index + 1, elements, count };
  }
  return best;
}

export function analyzeEssayText(text: string, options: { theme?: string; ocrLines?: number } = {}): EssayTextAnalysis {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  const paragraphs = splitParagraphs(clean);
  const sentences = splitSentences(clean);
  const words = countWords(clean);
  const normalized = normalizeForMatch(clean);
  const sentenceLengths = sentences.map(countWords);
  // Cada parágrafo começa numa linha nova e termina numa linha incompleta.
  const estimatedLines = paragraphs.reduce((sum, p) => sum + Math.ceil(p.length / CHARS_PER_HANDWRITTEN_LINE), 0);
  const lines = options.ocrLines ?? estimatedLines;

  const stems = tokenize(clean);
  const lexicalDiversity = stems.length ? new Set(stems).size / stems.length : 0;

  const byRelation: Partial<Record<ConnectiveRelation, string[]>> = {};
  const usage = new Map<string, number>();
  for (const [relation, list] of Object.entries(CONNECTIVES) as [ConnectiveRelation, string[]][]) {
    for (const connective of list) {
      const count = countOccurrences(normalized, connective);
      if (!count) continue;
      usage.set(connective, (usage.get(connective) ?? 0) + count);
      (byRelation[relation] ??= []).push(connective);
    }
  }
  const allConnectives = Object.values(CONNECTIVES).flat();
  const paragraphsWithoutLink = paragraphs
    .map((paragraph, index) => ({ paragraph, index }))
    .slice(1)
    .filter(({ paragraph }) => {
      const opening = normalizeForMatch(paragraph.split(/\s+/).slice(0, 6).join(' '));
      return !allConnectives.some((c) => opening.includes(` ${normalizeForMatch(c).trim()} `)) && !/^\s*(outro|outra|alem|por outro|em outra|nesse|nessa|desse|dessa|tal|esse|essa|com isso|diante|em vista)/.test(opening);
    })
    .map(({ index }) => index + 1);

  const wordCounts = new Map<string, number>();
  for (const raw of clean.toLowerCase().match(/[\p{L}]{5,}/gu) ?? []) {
    const key = stem(stripAccents(raw));
    wordCounts.set(key, (wordCounts.get(key) ?? 0) + 1);
  }
  const themeStems = new Set(options.theme ? tokenize(options.theme) : []);
  const repeatedWords = [...wordCounts.entries()]
    .filter(([word, count]) => count >= 4 && !themeStems.has(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }));

  const informalMarkers = INFORMAL_MARKERS.filter((m) => countOccurrences(normalized, m) > 0);
  const humanRightsFlags = HUMAN_RIGHTS_FLAGS.filter((m) => countOccurrences(normalized, m) > 0);
  const proposal = analyzeProposal(paragraphs);

  let themeCoverage: number | null = null;
  let themeTermsMissing: string[] = [];
  if (options.theme?.trim()) {
    const themeTerms = [...new Set(tokenize(options.theme))];
    const present = new Set(stems);
    const missing = themeTerms.filter((term) => !present.has(term));
    themeCoverage = themeTerms.length ? Number(((themeTerms.length - missing.length) / themeTerms.length).toFixed(2)) : null;
    themeTermsMissing = missing;
  }

  const zeroRisks: EssayTextAnalysis['zeroRisks'] = [];
  if (!clean) zeroRisks.push({ code: 'EM_BRANCO', detail: 'Nenhum texto reconhecido.' });
  else if (lines < MIN_LINES) zeroRisks.push({ code: 'TEXTO_INSUFICIENTE', detail: `${lines} linha(s); a cartilha zera redações com até 7 linhas.` });
  const disconnected = DISCONNECTED_FLAGS.filter((m) => countOccurrences(normalized, m) > 0);
  if (disconnected.length) zeroRisks.push({ code: 'PARTE_DESCONECTADA', detail: `Possível trecho desconectado do tema: ${disconnected.join(', ')}.` });
  const identification = IDENTIFICATION_FLAGS.filter((m) => countOccurrences(normalized, m) > 0);
  if (identification.length) zeroRisks.push({ code: 'IDENTIFICACAO', detail: `Possível identificação no texto: ${identification.join(', ')}.` });
  if (themeCoverage !== null && themeCoverage < 0.34) zeroRisks.push({ code: 'FUGA_AO_TEMA', detail: `Poucos termos do tema aparecem no texto (faltam: ${themeTermsMissing.join(', ')}).` });

  const warnings: string[] = [];
  if (paragraphs.length < 3) warnings.push('Menos de três parágrafos: estrutura com proposição, argumentação e conclusão pode não estar completa; ausência de paragrafação afeta a coesão.');
  if (paragraphs.length === 1) warnings.push('Texto em um único parágrafo (ausência de paragrafação).');
  if (lines > MAX_LINES) warnings.push(`Texto com ${lines} linhas, acima das 30 da folha oficial.`);
  const longest = Math.max(0, ...sentenceLengths);
  if (longest > 60) warnings.push(`Período muito longo (${longest} palavras): risco de truncamento, justaposição ou pontuação inadequada.`);
  if (usage.size < 4) warnings.push('Repertório limitado de recursos coesivos (poucos conectivos distintos).');
  const overused = [...usage.entries()].filter(([, count]) => count >= 3).map(([c]) => c);
  if (overused.length) warnings.push(`Conectivos repetidos: ${overused.join(', ')}.`);
  if (paragraphsWithoutLink.length) warnings.push(`Parágrafos sem elemento de ligação no início: ${paragraphsWithoutLink.join(', ')}.`);
  if (repeatedWords.length) warnings.push(`Palavras repetidas sem retomada por sinônimo ou pronome: ${repeatedWords.map((w) => `${w.word}… (${w.count}x)`).join(', ')}.`);
  if (informalMarkers.length) warnings.push(`Marcas de registro informal ou primeira pessoa: ${informalMarkers.join(', ')}.`);
  if (proposal.count === 0) warnings.push('Nenhuma proposta de intervenção identificada nos dois últimos parágrafos.');
  else {
    const missing = Object.entries(proposal.elements).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) warnings.push(`Proposta de intervenção sem: ${missing.join(', ')}.`);
  }
  if (humanRightsFlags.length) warnings.push(`Termos que podem indicar desrespeito aos direitos humanos: ${humanRightsFlags.join(', ')}.`);

  return {
    characters: clean.length,
    words,
    paragraphs: paragraphs.length,
    sentences: sentences.length,
    lines,
    linesSource: options.ocrLines !== undefined ? 'ocr' : 'estimativa',
    avgSentenceWords: sentences.length ? Number((words / sentences.length).toFixed(1)) : 0,
    longestSentenceWords: longest,
    lexicalDiversity: Number(lexicalDiversity.toFixed(3)),
    connectives: { total: [...usage.values()].reduce((a, b) => a + b, 0), distinct: usage.size, byRelation, overused, paragraphsWithoutLink },
    repeatedWords,
    informalMarkers,
    proposal,
    humanRightsFlags,
    themeCoverage,
    themeTermsMissing,
    zeroRisks,
    warnings,
  };
}
