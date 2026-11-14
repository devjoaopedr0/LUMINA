import { useState } from 'react';
import { BookmarkPlus, Copy, Loader2, Pencil, Sparkles, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/notebooks/Modal';
import { AiText } from '@/components/notebooks/AiText';
import { copyToClipboard, fieldClass } from '@/lib/notebook-ui';
import { ApiError, apiRepertoireAi } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import {
  VERDICT_LABEL,
  categoryLabel,
  missingRepertoireFields,
  practiceGuide,
  repertoireCopyText,
  repertoireInsertText,
  repertoireSections,
  type NotebookCollection,
  type Repertoire,
  type RepertoireAiResult,
} from '@/lib/notebooks';

const VERDICT_STYLE = {
  PERTINENTE: 'bg-emerald-50 text-emerald-800',
  SUPERFICIAL: 'bg-amber-50 text-amber-800',
  FORCADO: 'bg-red-50 text-red-700',
  DESCONTEXTUALIZADO: 'bg-red-50 text-red-700',
} as const;

/** Detalhe do repertório em seções, com cópia, favoritos, coleções e a LuminIA. */
export function RepertoireDetail({
  repertoire,
  collections = [],
  defaultTheme = '',
  onClose,
  onEdit,
  onDelete,
  onToggleFavorite,
  onSaveToNotebook,
  onAddToCollection,
  onInsert,
}: {
  repertoire: Repertoire;
  collections?: NotebookCollection[];
  defaultTheme?: string;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => Promise<void>;
  onToggleFavorite?: () => Promise<void>;
  onSaveToNotebook?: () => Promise<void>;
  onAddToCollection?: (collectionId: string) => Promise<void>;
  /** No editor de redação: insere o trecho no texto. */
  onInsert?: (text: string) => void;
}) {
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [ai, setAi] = useState<RepertoireAiResult | null>(null);
  const [aiError, setAiError] = useState('');
  const [theme, setTheme] = useState(defaultTheme);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const missing = repertoire.isPlatform ? [] : missingRepertoireFields(repertoire);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    try {
      await action();
    } finally {
      setBusy('');
    }
  }

  async function askAi(payload: Parameters<typeof apiRepertoireAi>[1]) {
    setAiError('');
    setAi(null);
    await run('ai', async () => {
      try {
        setAi(await apiRepertoireAi(getAccessToken() ?? '', payload));
      } catch (e) {
        setAiError(e instanceof ApiError ? e.message : 'A LuminIA não respondeu. Tente de novo.');
      }
    });
  }

  async function copy(text: string, what: string) {
    setNotice((await copyToClipboard(text)) ? `${what} copiado.` : 'Não foi possível copiar. Selecione o texto e copie manualmente.');
  }

  return (
    <Modal title={repertoire.title} onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="rounded-full bg-primary/15 px-3 py-1 text-primary-700">{categoryLabel(repertoire.category)}</span>
        {repertoire.isPlatform ? <span className="rounded-full bg-graphite/5 px-3 py-1">Acervo Lumina</span> : null}
        {repertoire.origin === 'AI' ? <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-800">Sugerido pela LuminIA</span> : null}
        {repertoire.isStudied ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">Já domino</span> : null}
      </div>

      <div className="mt-5 space-y-4">
        {repertoireSections(repertoire).map((section) => (
          <section key={section.title}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-graphite-400">{section.title}</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-graphite">{section.body}</p>
          </section>
        ))}
      </div>

      {repertoire.quote ? (
        <figure className="mt-4 rounded-xl border-l-4 border-primary bg-primary/5 p-3">
          <figcaption className="text-xs font-bold uppercase tracking-wider text-primary-700">Citação literal</figcaption>
          <blockquote className="mt-1 text-sm italic">“{repertoire.quote}”</blockquote>
          <p className="mt-1 text-xs text-graphite-500">{repertoire.quoteSource}</p>
        </figure>
      ) : (
        <p className="mt-4 text-xs text-graphite-400">Todo o texto acima é paráfrase: use com suas palavras, citando autor e obra.</p>
      )}

      <section className="mt-5 rounded-2xl bg-surface-card p-4">
        <h3 className="font-bold">Aplicação prática</h3>
        <dl className="mt-2 space-y-2 text-sm">
          {practiceGuide(repertoire).map(({ question, answer }) => (
            <div key={question}>
              <dt className="font-semibold">{question}</dt>
              <dd className={`whitespace-pre-wrap ${answer ? 'text-graphite' : 'text-graphite-400'}`}>{answer ?? 'Ainda não registrado: complete o repertório ou use "Aplicar ao meu tema".'}</dd>
            </div>
          ))}
        </dl>
      </section>

      {missing.length ? (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Para ficar completo, falta: {missing.join(', ')}.</p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {onInsert ? (
          <Button size="sm" onClick={() => { onInsert(repertoireInsertText(repertoire)); setNotice('Trecho inserido na redação.'); }}>
            Inserir na redação
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => void copy(repertoireInsertText(repertoire), 'Trecho')}>
          <Copy className="h-4 w-4" />Copiar trecho
        </Button>
        <Button size="sm" variant="outline" onClick={() => void copy(repertoireCopyText(repertoire), 'Repertório')}>
          <Copy className="h-4 w-4" />Copiar tudo
        </Button>
        {onSaveToNotebook ? (
          <Button size="sm" onClick={() => void run('save', onSaveToNotebook)} disabled={!!busy}>
            <BookmarkPlus className="h-4 w-4" />Salvar no meu caderno
          </Button>
        ) : null}
        {onToggleFavorite ? (
          <Button size="sm" variant="outline" onClick={() => void run('fav', onToggleFavorite)} disabled={!!busy}>
            <Star className={`h-4 w-4 ${repertoire.isFavorite ? 'fill-primary text-primary' : ''}`} />
            {repertoire.isFavorite ? 'Tirar dos favoritos' : 'Favoritar'}
          </Button>
        ) : null}
        {onEdit ? (
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="h-4 w-4" />Editar
          </Button>
        ) : null}
        {onDelete && !confirmDelete ? (
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />Excluir
          </Button>
        ) : null}
      </div>
      {confirmDelete && onDelete ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
          Excluir este repertório? Ele sai também das coleções.
          <Button size="sm" variant="secondary" onClick={() => void run('del', onDelete)} disabled={!!busy}>Excluir</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
        </div>
      ) : null}

      {onAddToCollection && collections.length ? (
        <label className="mt-4 block text-sm font-semibold">
          Adicionar a uma coleção
          <select
            className={fieldClass}
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (id) void run('col', async () => { await onAddToCollection(id); setNotice('Adicionado à coleção.'); });
            }}
          >
            <option value="">Escolha a coleção</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id} disabled={repertoire.collectionIds?.includes(c.id)}>
                {c.name}{repertoire.collectionIds?.includes(c.id) ? ' (já está)' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {notice ? <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p> : null}

      <section className="mt-6 rounded-2xl border border-surface-line p-4">
        <h3 className="flex items-center gap-2 font-bold">
          <Sparkles className="h-4 w-4 text-primary-700" />LuminIA
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void askAi({ action: 'explain', ids: [repertoire.id] })}>Explicar</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void askAi({ action: 'howToUse', ids: [repertoire.id], part: 'INTRODUCAO' })}>Usar na introdução</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void askAi({ action: 'howToUse', ids: [repertoire.id], part: 'DESENVOLVIMENTO' })}>Usar no desenvolvimento</Button>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className={`${fieldClass} mt-0`} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Tema da redação para conferir a pertinência" />
          <Button size="sm" variant="outline" disabled={!!busy || theme.trim().length < 3} onClick={() => void askAi({ action: 'apply', ids: [repertoire.id], theme: theme.trim() })}>
            Aplicar ao meu tema
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy || theme.trim().length < 3} onClick={() => void askAi({ action: 'check', ids: [repertoire.id], theme: theme.trim() })}>
            Conferir pertinência
          </Button>
        </div>
        {busy === 'ai' ? <p role="status" className="mt-3 flex items-center gap-2 text-sm text-graphite-500"><Loader2 className="h-4 w-4 animate-spin" />A LuminIA está pensando…</p> : null}
        {aiError ? <p role="alert" className="mt-3 text-sm text-red-700">{aiError}</p> : null}
        {ai?.check ? (
          <div className="mt-3 space-y-2 text-sm">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${VERDICT_STYLE[ai.check.verdict]}`}>{VERDICT_LABEL[ai.check.verdict]}</span>
            <p>{ai.check.explanation}</p>
            {ai.check.tips.length ? <ul className="list-disc pl-5">{ai.check.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul> : null}
          </div>
        ) : null}
        {ai?.application ? (
          <div className="mt-3 space-y-2 text-sm">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${ai.application.relevance === 'ALTA' ? 'bg-emerald-50 text-emerald-800' : ai.application.relevance === 'MEDIA' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>
              Pertinência ao tema: {ai.application.relevance === 'ALTA' ? 'alta' : ai.application.relevance === 'MEDIA' ? 'média' : 'baixa (considere outro repertório)'}
            </span>
            {[
              ['O que defende', ai.application.defends],
              ['Problema que explica', ai.application.problem],
              ['Como relacionar ao tema', ai.application.relation],
              ['Como sustentar a tese', ai.application.thesis],
              ['Como desenvolver sem só mencionar', ai.application.develop],
            ].filter(([, v]) => v).map(([label, value]) => (
              <p key={label}><span className="font-semibold">{label}:</span> {value}</p>
            ))}
            {ai.application.paragraph ? (
              <div className="rounded-xl border border-surface-line p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-graphite-400">Parágrafo modelo (adapte, não copie)</p>
                <p className="mt-1">{ai.application.paragraph}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        {ai?.text ? <div className="mt-3"><AiText text={ai.text} /></div> : null}
        {ai ? <p className="mt-2 text-xs text-graphite-400">{ai.disclaimer}</p> : null}
      </section>
    </Modal>
  );
}
