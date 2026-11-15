/**
 * Busca nos materiais (itens 49 e 50), regras puras.
 *
 * O texto do PDF fica guardado por página. A busca normaliza acentos e
 * maiúsculas, ignora palavras vazias e pontua cada página pelos termos que
 * aparecem nela (termo mais raro vale mais). O trecho mostrado é a janela em
 * volta da primeira ocorrência, para o aluno achar o ponto na página.
 */
export interface PageText {
  materialId: string;
  page: number;
  text: string;
}

export interface PageHit extends PageText {
  score: number;
  snippet: string;
  matched: string[];
}

const STOPWORDS = new Set(
  'a o as os de da do das dos e em no na nos nas um uma uns umas para por com sem que qual quais como onde quando porque se ao aos à às é ser foi são era isso isto esse essa este esta sobre mais menos muito pelo pela pelos pelas me te lhe eu voce você ele ela eles elas professor professora explicou explica explicar falou'.split(' '),
);

export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function queryTerms(query: string): string[] {
  const words = normalize(query).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 12);
}

function snippetAround(text: string, normalized: string, term: string, radius = 140): string {
  const at = normalized.indexOf(term);
  if (at < 0) return text.slice(0, radius * 2).trim();
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + term.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

/** Páginas mais relevantes para a consulta. Sem termo útil, nada. */
export function searchPages(pages: PageText[], query: string, limit = 10): PageHit[] {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const normalized = pages.map((p) => normalize(p.text));
  // Peso por raridade: termo que aparece em poucas páginas vale mais.
  const df = new Map(terms.map((t) => [t, normalized.filter((n) => n.includes(t)).length]));
  const hits: PageHit[] = [];
  pages.forEach((page, i) => {
    const n = normalized[i];
    const matched = terms.filter((t) => n.includes(t));
    if (!matched.length) return;
    const score = matched.reduce((sum, t) => {
      const occurrences = n.split(t).length - 1;
      return sum + Math.log(1 + pages.length / (df.get(t) || 1)) * (1 + Math.log(occurrences));
    }, 0) * (matched.length / terms.length);
    const rarest = [...matched].sort((a, b) => (df.get(a) ?? 0) - (df.get(b) ?? 0))[0];
    hits.push({ ...page, score, matched, snippet: snippetAround(page.text, n, rarest) });
  });
  return hits.sort((a, b) => b.score - a.score || a.page - b.page).slice(0, limit);
}

/** Texto das páginas escolhidas para o prompt, com teto de caracteres. */
export function contextFromHits(hits: Array<PageText & { title: string }>, maxChars = 7000): string {
  const parts: string[] = [];
  let used = 0;
  for (const h of hits) {
    const room = maxChars - used;
    if (room < 200) break;
    const body = h.text.replace(/\s+/g, ' ').trim().slice(0, Math.min(room, 2500));
    parts.push(`[${h.title}, p. ${h.page}]\n${body}`);
    used += body.length;
  }
  return parts.join('\n\n');
}
