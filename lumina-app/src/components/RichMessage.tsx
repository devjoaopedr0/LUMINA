import { Fragment, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { parseRichText, type Block, type Inline } from '@/lib/rich-text';

/** Desenha a fórmula com o KaTeX; se o LaTeX vier quebrado, mostra o texto cru em vez de falhar. */
function Math({ tex, display }: { tex: string; display: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, maxSize: 20, maxExpand: 200 });
    } catch {
      return null;
    }
  }, [tex, display]);
  if (!html) return <code className="rounded bg-surface-card px-1">{tex}</code>;
  // Saída do KaTeX com trust:false: só marcação de fórmula, sem links nem HTML do texto original.
  return <span className={display ? 'block' : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        switch (p.kind) {
          case 'text':
            return <Fragment key={i}>{p.text}</Fragment>;
          case 'bold':
            return <strong key={i} className="font-semibold text-graphite"><Inlines parts={p.children} /></strong>;
          case 'italic':
            return <em key={i}><Inlines parts={p.children} /></em>;
          case 'code':
            return <code key={i} className="rounded bg-surface-card px-1 py-0.5 text-[0.9em]">{p.text}</code>;
          case 'math':
            return <Math key={i} tex={p.tex} display={false} />;
        }
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'math':
      return (
        <div className="overflow-x-auto rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-[1.05em]" role="math" aria-label={block.tex}>
          <Math tex={block.tex} display />
        </div>
      );
    case 'heading':
      return <p className="font-bold text-graphite"><Inlines parts={block.children} /></p>;
    case 'paragraph':
      return <p><Inlines parts={block.children} /></p>;
    case 'list':
      return block.ordered ? (
        <ol start={block.start} className="space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary-700">{block.start + i}</span>
              <span className="min-w-0 flex-1"><Inlines parts={item} /></span>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc space-y-1 pl-5 marker:text-primary-700">
          {block.items.map((item, i) => <li key={i}><Inlines parts={item} /></li>)}
        </ul>
      );
  }
}

/**
 * Resposta da LuminIA em formato didático: parágrafos, passos numerados,
 * negrito nos termos-chave e fórmulas desenhadas (a principal em destaque).
 */
export function RichMessage({ text }: { text: string }) {
  const blocks = useMemo(() => parseRichText(text), [text]);
  return <div className="space-y-2.5">{blocks.map((b, i) => <BlockView key={i} block={b} />)}</div>;
}
