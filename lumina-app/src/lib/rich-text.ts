/**
 * Leitura da resposta da LuminIA para exibição didática: Markdown simples e
 * matemática em LaTeX. Função pura (testável sem navegador). O texto da IA
 * nunca vira HTML: só a matemática passa pelo KaTeX, na hora de desenhar.
 *
 * Blocos: fórmula em destaque ($$…$$ ou \[…\]), título curto (#), lista
 * (com "-", "*", "•" ou "1."), parágrafo. Dentro do texto: **negrito**,
 * *itálico*, `código` e fórmula na linha ($…$ ou \(…\)).
 */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; children: Inline[] }
  | { kind: 'italic'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'math'; tex: string };

export type Block =
  | { kind: 'math'; tex: string }
  | { kind: 'heading'; children: Inline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { kind: 'paragraph'; children: Inline[] };

const DISPLAY_MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;

/** Fórmula na linha: $…$ (sem pegar valores como "R$ 5,00 e R$ 6") ou \(…\). */
const INLINE_TOKEN = /\\\(([\s\S]+?)\\\)|\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)|\*\*(.+?)\*\*|`([^`\n]+)`|(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_TOKEN)) {
    const at = m.index ?? 0;
    // "R$" seguido de número é dinheiro, não matemática.
    if (m[2] !== undefined && /R$/.test(text.slice(Math.max(0, at - 1), at))) continue;
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) });
    if (m[1] !== undefined || m[2] !== undefined) out.push({ kind: 'math', tex: (m[1] ?? m[2]).trim() });
    else if (m[3] !== undefined) out.push({ kind: 'bold', children: parseInline(m[3]) });
    else if (m[4] !== undefined) out.push({ kind: 'code', text: m[4] });
    else if (m[5] !== undefined) out.push({ kind: 'italic', children: parseInline(m[5]) });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

const LIST_ITEM = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/;

function textBlocks(chunk: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', children: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: 'list', ordered: list.ordered, start: list.start, items: list.items.map(parseInline) });
    list = null;
  };

  for (const raw of chunk.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', children: parseInline(heading[1]) });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flushParagraph();
      const ordered = item[2] !== undefined;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, start: ordered ? Number(item[2]) : 1, items: [] };
      }
      list.items.push(item[3]);
      continue;
    }
    if (list && /^\s+/.test(raw)) {
      // Linha recuada continua o item anterior; sem recuo, começa um parágrafo.
      list.items[list.items.length - 1] += ` ${line}`;
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function parseRichText(text: string): Block[] {
  const blocks: Block[] = [];
  let last = 0;
  const source = text.replace(/\r\n?/g, '\n');
  for (const m of source.matchAll(DISPLAY_MATH)) {
    const at = m.index ?? 0;
    blocks.push(...textBlocks(source.slice(last, at)));
    blocks.push({ kind: 'math', tex: (m[1] ?? m[2]).trim() });
    last = at + m[0].length;
  }
  blocks.push(...textBlocks(source.slice(last)));
  return blocks;
}

/** Texto puro da mensagem (para copiar ou ler em voz alta), sem marcação. */
export function plainText(blocks: Block[]): string {
  const inline = (parts: Inline[]): string =>
    parts.map((p) => (p.kind === 'text' || p.kind === 'code' ? p.text : p.kind === 'math' ? p.tex : inline(p.children))).join('');
  return blocks
    .map((b) => (b.kind === 'math' ? b.tex : b.kind === 'list' ? b.items.map((i, k) => `${b.ordered ? `${b.start + k}.` : '-'} ${inline(i)}`).join('\n') : inline(b.children)))
    .join('\n\n');
}
