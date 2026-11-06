import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, BookOpen, Loader2, Quote, Send, Sparkles, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  ESSAY_COMPETENCY_LABELS,
  apiEssayReviewChat,
  type EssayCompetencyId,
  type EssayReviewMessage,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { formatDateTime } from './essay-review-ui';

export type ChatFocus = EssayCompetencyId | 'FINAL';

const FOCUS_LABELS: Record<ChatFocus, string> = {
  FINAL: 'Nota final e visão geral',
  ...ESSAY_COMPETENCY_LABELS,
};

export function EssayReviewChat({
  essayId,
  reviewId,
  messages,
  focus,
  onFocusChange,
  selectedText,
  onClearSelectedText,
  onAppended,
  disabled = false,
}: {
  essayId: string;
  reviewId?: string;
  messages: EssayReviewMessage[];
  focus: ChatFocus;
  onFocusChange: (focus: ChatFocus) => void;
  selectedText: string | null;
  onClearSelectedText: () => void;
  onAppended: (messages: EssayReviewMessage[]) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCount = useRef(messages.length);

  useEffect(() => {
    if (messages.length !== lastMessageCount.current) {
      lastMessageCount.current = messages.length;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const typed = input.trim();
    const anchor = selectedText?.trim() || undefined;
    if ((!typed && !anchor) || busy) return;
    const question = typed || 'Explique este trecho da redação e como ele foi considerado na avaliação.';
    setBusy(true);
    setError('');
    try {
      const response = await apiEssayReviewChat(getAccessToken() ?? '', essayId, {
        message: question,
        competency: focus === 'FINAL' ? undefined : focus,
        anchorText: anchor,
        reviewId,
      });
      onAppended(response.messages);
      setInput('');
      onClearSelectedText();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível falar com a LuminIA agora.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex min-h-[620px] flex-col rounded-2xl border border-surface-line bg-white" aria-label="Chat contextual com a LuminIA">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-line px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-graphite"><Bot size={18} className="text-primary-700" />Converse com a LuminIA</h2>
          <p className="mt-1 text-xs text-graphite-500">Peça a defesa técnica da nota, cite o Inep e confronte com trechos da redação.</p>
        </div>
        <select
          aria-label="Competência em foco no chat"
          value={focus}
          onChange={(event) => onFocusChange(event.target.value as ChatFocus)}
          className="max-w-full rounded-xl border border-surface-line bg-white px-3 py-2 text-xs font-semibold"
        >
          {Object.entries(FOCUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-surface-card/60 p-4">
        {!messages.length ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-graphite-700">
            <p className="flex items-center gap-2 font-semibold"><Sparkles size={16} />A IA não muda a nota sozinha.</p>
            <p className="mt-2">Comece pedindo a interpretação de um critério, questione uma nota ou selecione um trecho da redação e pergunte por que ele sustenta a avaliação.</p>
            <p className="mt-2 text-xs text-graphite-500">A conversa é registrada para auditoria. Só um aprendizado validado e anonimizado pode influenciar avaliações futuras.</p>
          </div>
        ) : null}
        {messages.map((message) => {
          const mine = message.role === 'EVALUATOR';
          const system = message.role === 'SYSTEM';
          return (
            <article key={message.id} className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}>
              <span className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${mine ? 'bg-graphite text-white' : system ? 'bg-slate-200 text-slate-600' : 'bg-primary text-graphite'}`}>
                {mine ? <UserRound size={15} /> : <Bot size={15} />}
              </span>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${mine ? 'bg-graphite text-white' : system ? 'bg-slate-100 text-slate-700' : 'bg-white text-graphite shadow-sm ring-1 ring-surface-line'}`}>
                {message.anchorJson?.text ? (
                  <p className={`mb-2 flex items-start gap-1 rounded-lg px-2 py-1 text-xs italic ${mine ? 'bg-white/10 text-white/80' : 'bg-primary/10 text-graphite-700'}`}><Quote size={12} className="mt-0.5 shrink-0" />“{message.anchorJson.text}”</p>
                ) : null}
                <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
                {message.citationsJson?.length ? (
                  <ul className="mt-3 space-y-1.5 border-t border-current/10 pt-2">
                    {message.citationsJson.map((citation) => (
                      <li key={`${message.id}:${citation.id}`} className={`flex items-start gap-1.5 text-[11px] ${mine ? 'text-white/70' : 'text-graphite-500'}`}>
                        <BookOpen size={12} className="mt-0.5 shrink-0" />
                        <span><strong>{citation.title}</strong> — {citation.citation}{citation.page ? `, p. ${citation.page}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className={`mt-2 text-[10px] ${mine ? 'text-white/50' : 'text-graphite-400'}`}>{formatDateTime(message.createdAt)}{message.model ? ` · ${message.model}` : ''}</p>
              </div>
            </article>
          );
        })}
        {busy ? <p className="flex items-center gap-2 text-sm text-graphite-500" role="status"><Loader2 size={15} className="animate-spin" />A LuminIA está conferindo os critérios oficiais e a correção registrada.</p> : null}
      </div>

      <form onSubmit={(event) => void send(event)} className="border-t border-surface-line p-3">
        {selectedText ? (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/10 p-2 text-xs text-graphite-700">
            <Quote size={14} className="mt-0.5 shrink-0" />
            <p className="line-clamp-3 flex-1 italic">“{selectedText}”</p>
            <button type="button" onClick={onClearSelectedText} aria-label="Remover trecho selecionado" className="rounded p-1 hover:bg-white/70"><X size={13} /></button>
          </div>
        ) : null}
        {error ? <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
        <div className="flex items-end gap-2">
          <textarea
            aria-label="Mensagem para a LuminIA"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={4000}
            disabled={disabled || busy}
            placeholder={selectedText ? 'O que você quer discutir sobre o trecho selecionado?' : 'Ex.: por que C3 ficou em 120 e não em 160? Quais critérios do Inep sustentam a nota?'}
            className="max-h-32 min-h-[54px] flex-1 resize-y rounded-xl border border-surface-line bg-white px-3 py-2 text-sm focus:outline-primary disabled:opacity-60"
          />
          <Button type="submit" disabled={disabled || busy || (!input.trim() && !selectedText)} aria-label="Enviar mensagem"><Send size={16} />Enviar</Button>
        </div>
        <p className="mt-1.5 text-[11px] text-graphite-400">A resposta é uma análise colaborativa, não uma nova correção automática.</p>
      </form>
    </section>
  );
}
