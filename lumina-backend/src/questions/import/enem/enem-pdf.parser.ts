/**
 * Funções puras de parsing dos cadernos do ENEM — nenhuma faz I/O (rede ou
 * PDF de verdade). O download e a extração via pdfjs-dist ficam em
 * enem-import.service.ts; isso mantém a lógica de texto testável com
 * pequenos trechos sintéticos, sem depender do binário real do PDF.
 */

export interface EnemAreaRange {
  from: number;
  to: number;
  areaLabel: string;
}

export interface EnemParsedQuestionBody {
  stem: string;
  alternatives: { letter: string; text: string }[];
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Lê a página de instruções do caderno e extrai os intervalos de questão por
 * área de conhecimento — o próprio INEP declara isso em todo caderno (ex:
 * "questões de número 91 a 135, relativas à área de Ciências da Natureza e
 * suas Tecnologias"). Evita hardcodar a numeração, que já variou entre
 * formatos de prova ao longo dos anos.
 */
export function parseAreaRanges(introText: string): EnemAreaRange[] {
  const ranges: EnemAreaRange[] = [];
  const re =
    /quest(?:õ|o)es\s+de\s+n[uú]mero\s+(\d{1,3})\s+a\s+(\d{1,3})\s*,?\s*relativas?\s+[aà]\s+[aá]rea\s+de\s+([^;.)]+)/gi;

  let match: RegExpExecArray | null;
  while ((match = re.exec(introText))) {
    ranges.push({
      from: parseInt(match[1], 10),
      to: parseInt(match[2], 10),
      areaLabel: match[3].trim().replace(/\s+/g, ' '),
    });
  }
  return ranges;
}

/** Resolve a área de conhecimento (rótulo do próprio ENEM) a partir do
 * número da questão e dos intervalos declarados no caderno. */
export function resolveAreaLabel(questionNumber: number, ranges: EnemAreaRange[]): string | null {
  return ranges.find((r) => questionNumber >= r.from && questionNumber <= r.to)?.areaLabel ?? null;
}

const AREA_TO_SUBJECT: [needle: string, subject: string][] = [
  ['linguagens', 'Linguagens'],
  ['ciencias humanas', 'Ciências Humanas'],
  ['ciencias da natureza', 'Ciências da Natureza'],
  ['matematica', 'Matemática'],
];

/** Área declarada pelo ENEM → nome de disciplina do catálogo da Lumina. */
export function areaLabelToSubject(areaLabel: string): string {
  const normalized = stripAccents(areaLabel).toLowerCase();
  for (const [needle, subject] of AREA_TO_SUBJECT) {
    if (normalized.includes(needle)) return subject;
  }
  return areaLabel;
}

/** Separa o texto do caderno em blocos por "QUESTÃO NN", descartando o
 * cabeçalho de instruções antes da primeira. */
export function splitQuestionBlocks(fullText: string): { number: number; body: string }[] {
  const firstIndex = fullText.search(/QUEST[ÃA]O\s+\d{1,3}/);
  const relevant = firstIndex >= 0 ? fullText.slice(firstIndex) : fullText;
  const parts = relevant.split(/QUEST[ÃA]O\s+(\d{1,3})\s+/).slice(1);

  const blocks: { number: number; body: string }[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const number = parseInt(parts[i], 10);
    if (Number.isInteger(number)) blocks.push({ number, body: parts[i + 1] ?? '' });
  }
  return blocks;
}

const ALTERNATIVE_LETTERS = ['A', 'B', 'C', 'D', 'E'];

interface AlternativeMarker {
  letter: string;
  index: number;
  /** Inclui a letra duplicada quando o caderno traz "A A texto". */
  length: number;
}

/**
 * Marcadores de alternativa no texto do pdfjs. O formato varia entre
 * edições: cadernos como o de 2023 trazem a letra "circulada" seguida da
 * letra corrida ("A A texto"), enquanto o de 2024 traz só a letra com
 * espaçamento largo ("A   texto"). Aceitamos as duas formas e depois
 * escolhemos a última sequência A,B,C,D,E — letras soltas no enunciado
 * ("A desmineralização...") não podem ser confundidas com alternativas.
 */
function alternativeMarkers(body: string): AlternativeMarker[] {
  const re = /\b([A-E])\b(?:\s+\1\b)?/g;
  return [...body.matchAll(re)].map((match) => ({
    letter: match[1],
    index: match.index ?? 0,
    length: match[0].length,
  }));
}

/**
 * Extrai enunciado + as 5 alternativas de um bloco de questão. Usa a ÚLTIMA
 * sequência de marcadores A,B,C,D,E (ver alternativeMarkers) e exige texto
 * em todas as alternativas.
 *
 * Retorna `null` quando o padrão não é reconhecido — ex: questão cujas
 * alternativas são predominantemente gráficas, ou que atravessa uma quebra
 * de página de forma atípica. Nesses casos o chamador reporta como falha de
 * extração; nunca inventa um valor.
 */
export function parseQuestionBody(body: string): EnemParsedQuestionBody | null {
  const markers = alternativeMarkers(body);
  const picked: AlternativeMarker[] = [];
  let searchEnd = markers.length - 1;

  for (const letter of [...ALTERNATIVE_LETTERS].reverse()) {
    let found = -1;
    for (let i = searchEnd; i >= 0; i--) {
      if (markers[i].letter === letter) {
        found = i;
        break;
      }
    }
    if (found < 0) return null;
    picked.unshift(markers[found]);
    searchEnd = found - 1;
  }

  const stem = body.slice(0, picked[0].index).replace(/\s+/g, ' ').trim();
  if (stem.length === 0) return null;

  const alternatives = picked.map((mark, idx) => {
    const start = mark.index + mark.length;
    const end = idx + 1 < picked.length ? picked[idx + 1].index : body.length;
    return {
      letter: mark.letter,
      text: body.slice(start, end).replace(/\s+/g, ' ').trim(),
    };
  });

  if (alternatives.some((a) => a.text.length === 0)) return null;
  return { stem, alternatives };
}

/**
 * Itens que o pdfjs extrai das margens do caderno não são conteúdo de
 * questão: marca d'água repetida ("ENEM2024…", fonte minúscula), rodapé
 * ("*020125AM2*", "2º DIA • CADERNO 5 • AMARELO"), cabeçalho de área e
 * número da página. Sem removê-los, eles entram no meio de uma questão que
 * atravessa a página e contaminam as alternativas.
 */
const PAGE_FURNITURE_PATTERNS: RegExp[] = [
  /^(ENEM\d{4})+$/,
  /^\*\d{6}AM\d+\*$/,
  /^(?:CIÊNCIAS DA NATUREZA|MATEMÁTICA|CIÊNCIAS HUMANAS|LINGUAGENS, CÓDIGOS) E SUAS TECNOLOGIAS$/,
  /(?:CIÊNCIAS DA NATUREZA|MATEMÁTICA|CIÊNCIAS HUMANAS|LINGUAGENS, CÓDIGOS) E SUAS TECNOLOGIAS\s*•/,
  /DIA\s*•\s*CADERNO/,
  /^Questões de \d+ a \d+$/,
];

export function isEnemPageFurniture(item: {
  str: string;
  height?: number;
  transform?: number[];
}): boolean {
  const text = item.str.trim();
  if (!text) return true;
  // A marca d'água é desenhada com fonte de 2pt; nenhum texto real é tão baixo.
  if ((item.height ?? 0) < 4) return true;
  if (PAGE_FURNITURE_PATTERNS.some((pattern) => pattern.test(text))) return true;

  // Rodapé: "º" e o número da página ficam abaixo de ~65pt (o conteúdo
  // começa por volta de 77pt). Só descartamos esses tokens curtos, nunca
  // texto de questão.
  const y = item.transform?.[5];
  if (y !== undefined && y < 65 && /^(?:\d{1,2}|º)$/.test(text)) return true;
  return false;
}

/**
 * Fórmulas e figuras viram uma sopa de números no texto do pdfjs (ex:
 * "6 6 3", "3 12 3 01", "1 25 1 25 1 25 + +"). Essas alternativas não são
 * confiáveis: melhor pular a questão e dizer o motivo do que gravar um
 * enunciado que não corresponde ao caderno.
 */
export function isUnreliableEnemExtraction(parsed: EnemParsedQuestionBody): boolean {
  return parsed.alternatives.some((alternative) => {
    if (alternative.text.includes('!')) return true;
    const tokens = alternative.text.split(/\s+/);
    let run = 0;
    let longestRun = 0;
    for (const token of tokens) {
      if (/^\d{1,2}$/.test(token)) {
        run += 1;
        longestRun = Math.max(longestRun, run);
      } else {
        run = 0;
      }
    }
    // Sequência de três ou mais números soltos: fórmula quebrada ("6 6 3").
    if (longestRun >= 3) return true;
    // Sem nenhuma letra e com três números: também é fórmula/figura.
    const hasLetters = /[a-zA-ZÀ-ÿ]/.test(alternative.text);
    const bareNumbers = tokens.filter((token) => /^\d{1,2}$/.test(token)).length;
    return !hasLetters && bareNumbers >= 3;
  });
}

/**
 * Extrai o mapa questão→gabarito de um PDF de gabarito do ENEM. Espera o
 * texto SEM espaços entre os "text runs" do pdfjs — números de 3 dígitos às
 * vezes vêm partidos em dois runs (ex: "121" → "12" + "1"); juntar sem
 * espaço reconstitui o número certo, o que juntar COM espaço não faz.
 *
 * "Anulado" é reconhecido antes das letras soltas de propósito: numa
 * alternância regex ingênua (A|B|C|D|E|Anulado), o "A" bateria primeiro
 * dentro de "Anulado" e inventaria um gabarito errado para a questão anulada
 * — daqui vem a ordem (Anulado|[A-E]) e o lookahead negativo pra letra
 * minúscula seguinte.
 */
export function parseGabaritoText(rawTextNoSpaces: string): Map<number, string> {
  const result = new Map<number, string>();
  const re = /(\d{2,3})\s*(Anulado|[A-E])(?![a-z])/g;

  let match: RegExpExecArray | null;
  while ((match = re.exec(rawTextNoSpaces))) {
    result.set(parseInt(match[1], 10), match[2]);
  }
  return result;
}

const NATUREZA_KEYWORDS: Record<string, string[]> = {
  Física: [
    'velocidade', 'aceleracao', 'forca', 'energia cinetica', 'corrente eletrica',
    'campo magnetico', 'frequencia', 'newton', 'joule', 'watt', 'circuito',
    'tensao eletrica', 'resistor', 'movimento uniforme', 'atrito', 'gravitacional',
  ],
  Química: [
    'reacao quimica', 'molecula', 'atomo', 'mol de', 'solucao aquosa', 'concentracao',
    ' ph ', 'ligacao quimica', 'composto organico', 'elemento quimico', 'oxidacao',
    'acido', 'base forte', 'tabela periodica', 'substancia',
  ],
  Biologia: [
    'celula', 'organismo', 'especie', 'dna', 'ecossistema', 'proteina', 'genetica',
    'evolucao', 'metabolismo', 'tecido', 'orgao', 'bacteria', 'virus', 'fotossintese',
    'populacao de',
  ],
};

/**
 * Heurística best-effort para sub-classificar "Ciências da Natureza" em
 * Física/Química/Biologia — o ENEM não declara isso por questão, só a área
 * ampla (ver parseAreaRanges). NUNCA é fonte de verdade: é uma sugestão
 * inicial por palavra-chave, revisável depois via PATCH /questions/:id.
 * Empate ou nenhum sinal → mantém a área ampla em vez de arriscar um chute.
 */
export function classifyCienciasNaturezaSubject(stem: string): string {
  const normalized = stripAccents(stem).toLowerCase();
  const scores = Object.entries(NATUREZA_KEYWORDS).map(([subject, words]) => ({
    subject,
    score: words.reduce((count, word) => (normalized.includes(word) ? count + 1 : count), 0),
  }));

  scores.sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (best.score === 0 || best.score === second.score) return 'Ciências da Natureza';
  return best.subject;
}

export type GabaritoLanguage = '' | 'INGLES' | 'ESPANHOL';

export interface OfficialGabaritoItem {
  number: number;
  /** "A"–"E" ou null quando o INEP anulou a questão. */
  letter: string | null;
  language: GabaritoLanguage;
}

export interface OfficialGabarito {
  year: number | null;
  day: number | null;
  bookletColor: string | null;
  bookletNumber: number | null;
  items: OfficialGabaritoItem[];
}

const BOOKLET_COLORS = ['Azul', 'Amarelo', 'Branco', 'Rosa', 'Cinza', 'Verde', 'Laranja', 'Roxo'];

/**
 * Lê o PDF de gabarito oficial do Enem inteiro (texto SEM espaço entre os
 * runs, como em parseGabaritoText), com o cabeçalho do caderno e as duas
 * línguas das questões 1–5 do 1º dia. Formato real do INEP (2023/2024):
 *
 *   "CADERNO 1AzulGabarito 20231diaºQUESTÃO GABARITO46 C47 D… INGLÊS ESPANHOL1 B A2 B A…"
 *
 * Diferente de parseGabaritoText, aceita questões de 1 dígito (1–9) e exige
 * o espaço entre número e letra que o PDF real tem ("46 C"), o que evita ler
 * "CADERNO 1Azul" ou o ano como questão.
 */
export function parseOfficialGabarito(raw: string): OfficialGabarito {
  const year = /Gabarito\s*(\d{4})/i.exec(raw);
  const dayAfter = /Gabarito\s*\d{4}\s*(\d)\s*dia/i.exec(raw) ?? /dia\s*º?\s*(\d)/i.exec(raw);
  const color = BOOKLET_COLORS.find((c) => new RegExp(c, 'i').test(raw.slice(0, 200))) ?? null;
  const booklet = /CADERNO\s*(\d{1,2})/i.exec(raw);

  // Cabeçalho das línguas: a 1ª letra é a da língua que vem primeiro.
  const norm = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const en = norm.indexOf('INGLES');
  const es = norm.indexOf('ESPANHOL');
  const order: GabaritoLanguage[] = es >= 0 && en > es ? ['ESPANHOL', 'INGLES'] : ['INGLES', 'ESPANHOL'];

  const items: OfficialGabaritoItem[] = [];
  const seen = new Map<string, string | null>();
  const re = /(\d{1,3}) +(Anulad[oa]|[A-E])(?: +(Anulad[oa]|[A-E]))?(?![a-z])/g;
  let m: RegExpExecArray | null;
  const push = (number: number, value: string, language: GabaritoLanguage) => {
    const letter = /^anulad/i.test(value) ? null : value;
    const key = `${number}:${language}`;
    if (seen.has(key)) {
      if (seen.get(key) !== letter) throw new Error(`Gabarito ambíguo: a questão ${number} aparece com respostas diferentes.`);
      return;
    }
    seen.set(key, letter);
    items.push({ number, letter, language });
  };
  while ((m = re.exec(raw))) {
    const number = Number(m[1]);
    if (number < 1 || number > 180) continue;
    if (m[3] && en >= 0 && es >= 0) {
      push(number, m[2], order[0]);
      push(number, m[3], order[1]);
    } else {
      push(number, m[2], '');
    }
  }
  items.sort((a, b) => a.number - b.number || a.language.localeCompare(b.language));
  return {
    year: year ? Number(year[1]) : null,
    day: dayAfter ? Number(dayAfter[1]) : null,
    bookletColor: color,
    bookletNumber: booklet ? Number(booklet[1]) : null,
    items,
  };
}
