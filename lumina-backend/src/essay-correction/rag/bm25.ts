/**
 * Recuperação lexical (BM25) para o RAG da correção de redação.
 *
 * Por que lexical e não embeddings: a base é pequena (dezenas de trechos),
 * fechada e escrita com o vocabulário técnico da própria cartilha
 * ("tangenciamento", "repertório", "agente", "coesão"). BM25 acerta esses
 * termos exatos, roda sem API externa, é determinístico (o mesmo texto
 * recupera sempre os mesmos trechos — a correção fica auditável) e testável.
 */

const STOPWORDS = new Set(
  (
    'a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para pra com sem sob sobre ' +
    'e ou mas que se nao sim como quando onde qual quais quem cujo cuja ao aos à às ate apos entre ' +
    'eu tu ele ela nos vos eles elas me te lhe lhes seu sua seus suas meu minha meus minhas isso isto aquilo esse essa ' +
    'esses essas este esta estes estas aquele aquela aqueles aquelas ja tambem muito muita muitos muitas mais menos ' +
    'ser e foi era sao sera estao esta estava ha havia ter tem tinha sua ate so pois porque entao assim'
  ).split(/\s+/),
);

export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Radical simplificado para português: corta plurais e sufixos frequentes.
 * Não é o RSLP completo — o objetivo é só juntar "argumentos/argumentação/
 * argumentativo" e "coesão/coesivos" no mesmo radical, o que basta para uma
 * base deste tamanho.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length <= 3) return w;
  // 1. Plural.
  if (w.endsWith('oes') || w.endsWith('aes')) w = `${w.slice(0, -3)}ao`;
  else if (w.endsWith('ais')) w = `${w.slice(0, -3)}al`;
  else if (w.endsWith('eis') && w.length > 5) w = `${w.slice(0, -3)}el`;
  else if (w.endsWith('ns')) w = `${w.slice(0, -2)}m`;
  else if (/[rsz]es$/.test(w) && w.length > 5) w = w.slice(0, -2);
  else if (w.endsWith('s') && w.length > 4) w = w.slice(0, -1);
  // 2. Sufixo derivacional (um só).
  for (const suffix of ['mente', 'acao', 'icao', 'ativo', 'ativa', 'idade', 'ancia', 'encia', 'ismo', 'ista', 'ivo', 'iva']) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  // 3. Vogal temática ("argumento" → "argument", "coesão" → "coes").
  if (w.endsWith('ao') && w.length > 5) w = w.slice(0, -2);
  else if (/[aeo]$/.test(w) && w.length > 4) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return stripAccents(text.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .map(stem);
}

export interface Bm25Document {
  id: string;
  text: string;
}

export interface Bm25Hit {
  id: string;
  score: number;
}

export class Bm25Index {
  private readonly docs: { id: string; length: number; tf: Map<string, number> }[];
  private readonly df = new Map<string, number>();
  private readonly avgLength: number;

  constructor(
    documents: Bm25Document[],
    private readonly k1 = 1.4,
    private readonly b = 0.7,
  ) {
    this.docs = documents.map((doc) => {
      const tokens = tokenize(doc.text);
      const tf = new Map<string, number>();
      for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
      for (const token of tf.keys()) this.df.set(token, (this.df.get(token) ?? 0) + 1);
      return { id: doc.id, length: tokens.length, tf };
    });
    this.avgLength = this.docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, this.docs.length);
  }

  search(query: string, limit = 5, filter?: (id: string) => boolean): Bm25Hit[] {
    const terms = [...new Set(tokenize(query))];
    const n = this.docs.length;
    const hits: Bm25Hit[] = [];
    for (const doc of this.docs) {
      if (filter && !filter(doc.id)) continue;
      let score = 0;
      for (const term of terms) {
        const freq = doc.tf.get(term);
        if (!freq) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += idf * ((freq * (this.k1 + 1)) / (freq + this.k1 * (1 - this.b + (this.b * doc.length) / this.avgLength)));
      }
      if (score > 0) hits.push({ id: doc.id, score });
    }
    // Empate desfeito pelo id: a mesma consulta devolve sempre a mesma ordem.
    return hits.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id)).slice(0, limit);
  }
}
