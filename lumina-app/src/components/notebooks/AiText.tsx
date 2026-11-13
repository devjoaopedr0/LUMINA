import { parseAiBlocks, splitBold } from '@/lib/notebooks';

function Inline({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((part, i) => (part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>))}
    </>
  );
}

/** Resposta da LuminIA com o Markdown simples já formatado (sem HTML cru). */
export function AiText({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {parseAiBlocks(text).map((block, i) => {
        if (block.kind === 'heading') return <p key={i} className="font-bold"><Inline text={block.text} /></p>;
        if (block.kind === 'paragraph') return <p key={i}><Inline text={block.text} /></p>;
        const List = block.ordered ? 'ol' : 'ul';
        return (
          <List key={i} className={`${block.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>
            {block.items.map((item, j) => <li key={j}><Inline text={item} /></li>)}
          </List>
        );
      })}
    </div>
  );
}
