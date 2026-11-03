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

/**
 * Extrai enunciado + as 5 alternativas de um bloco de questão. No texto
 * extraído pelo pdfjs, cada alternativa vem marcada por uma letra
 * "circulada" seguida da própria letra corrida (ex: "A A texto...") — um
 * artefato de como os glifos decorativos do PDF são lidos, não um erro de
 * digitação. Usa as ÚLTIMAS 5 ocorrências desse padrão (evita confundir com
 * letras soltas dentro do enunciado) e confere que elas realmente formam
 * A,B,C,D,E em ordem antes de aceitar.
 *
 * Retorna `null` quando o padrão não é reconhecido — ex: questão cujas
 * alternativas são predominantemente numéricas/gráficas sem o texto de
 * apoio, ou que atravessa uma quebra de página de forma atípica. Nesses
 * casos o chamador reporta como falha de extração; nunca inventa um valor.
 */
export function parseQuestionBody(body: string): EnemParsedQuestionBody | null {
  const markerRe = /\b([A-E])\s*\1\s+/g;
  const marks = [...body.matchAll(markerRe)];
  if (marks.length < 5) return null;

  const last5 = marks.slice(-5);
  if (last5.map((m) => m[1]).join('') !== ALTERNATIVE_LETTERS.join('')) return null;

  const stem = body.slice(0, last5[0].index).replace(/\s+/g, ' ').trim();
  if (stem.length === 0) return null;

  const alternatives = last5.map((mark, idx) => {
    const start = (mark.index ?? 0) + mark[0].length;
    const end = idx + 1 < last5.length ? (last5[idx + 1].index ?? body.length) : body.length;
    return {
      letter: mark[1],
      text: body.slice(start, end).replace(/\s+/g, ' ').trim(),
    };
  });

  if (alternatives.some((a) => a.text.length === 0)) return null;
  return { stem, alternatives };
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
