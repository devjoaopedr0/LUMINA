import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/notebooks/Modal';
import { fieldClass } from '@/lib/notebook-ui';
import {
  CATEGORY_LABEL,
  REFERENCE_TYPE_LABEL,
  REFERENCE_TYPES,
  REPERTOIRE_CATEGORIES,
  REPERTOIRE_THEMES,
  THEME_LABEL,
  isCustomCategory,
  type ReferenceType,
  type RepertoirePayload,
  type RepertoireTheme,
} from '@/lib/notebooks';

const NEW_CATEGORY = '__nova__';

/** Formulário completo do repertório (criar, editar ou revisar uma sugestão da LuminIA). */
export function RepertoireForm({
  title,
  initial,
  customCategories,
  canPublish,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: RepertoirePayload;
  customCategories: string[];
  canPublish?: boolean;
  onSubmit: (payload: RepertoirePayload) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<RepertoirePayload>(initial);
  const [keywords, setKeywords] = useState((initial.keywords ?? []).join(', '));
  const [themes, setThemes] = useState((initial.relatedThemes ?? []).join('; '));
  const startsCustom = !!initial.category && isCustomCategory(initial.category);
  const [categoryChoice, setCategoryChoice] = useState(startsCustom ? NEW_CATEGORY : (initial.category ?? 'OUTRA'));
  const [customCategory, setCustomCategory] = useState(startsCustom ? initial.category! : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof RepertoirePayload>(key: K, value: RepertoirePayload[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: keyof RepertoirePayload) => (form[key] as string | null | undefined) ?? '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    const category = categoryChoice === NEW_CATEGORY ? customCategory.trim() : categoryChoice;
    if (form.title.trim().length < 2) return setError('Dê um título ao repertório.');
    if (form.summary.trim().length < 10) return setError('Explique o conceito com pelo menos 10 caracteres.');
    if (categoryChoice === NEW_CATEGORY && category.length < 2) return setError('Dê um nome à nova categoria.');
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        ...form,
        category,
        keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
        relatedThemes: themes.split(';').map((t) => t.trim()).filter(Boolean),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
      setBusy(false);
    }
  }

  const area = (key: keyof RepertoirePayload, label: string, hint?: string) => (
    <label className="block text-sm font-semibold">
      {label}
      {hint ? <span className="ml-1 font-normal text-graphite-400">{hint}</span> : null}
      <textarea rows={3} className={fieldClass} value={text(key)} onChange={(e) => set(key, e.target.value as never)} />
    </label>
  );

  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold sm:col-span-2">
            Título *
            <input className={fieldClass} value={form.title} maxLength={240} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Modernidade líquida" required />
          </label>
          <label className="block text-sm font-semibold">
            Autor ou responsável
            <input className={fieldClass} value={text('author')} maxLength={200} onChange={(e) => set('author', e.target.value)} placeholder="Ex.: Zygmunt Bauman" />
          </label>
          <label className="block text-sm font-semibold">
            Tipo de referência
            <select className={fieldClass} value={form.referenceType ?? 'OUTRO'} onChange={(e) => set('referenceType', e.target.value as ReferenceType)}>
              {REFERENCE_TYPES.map((type) => (
                <option key={type} value={type}>{REFERENCE_TYPE_LABEL[type]}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Categoria *
            <select className={fieldClass} value={categoryChoice} onChange={(e) => setCategoryChoice(e.target.value)}>
              {REPERTOIRE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
              {customCategories.map((c) => (
                <option key={c} value={c}>{c} (minha)</option>
              ))}
              <option value={NEW_CATEGORY}>+ Nova categoria…</option>
            </select>
          </label>
          {categoryChoice === NEW_CATEGORY ? (
            <label className="block text-sm font-semibold">
              Nome da nova categoria
              <input className={fieldClass} value={customCategory} maxLength={60} onChange={(e) => setCustomCategory(e.target.value)} />
            </label>
          ) : (
            <label className="block text-sm font-semibold">
              Tema de redação
              <select className={fieldClass} value={form.theme ?? 'OUTRO'} onChange={(e) => set('theme', e.target.value as RepertoireTheme)}>
                {REPERTOIRE_THEMES.map((t) => (
                  <option key={t} value={t}>{THEME_LABEL[t]}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm font-semibold">
            Fonte ou bibliografia
            <input className={fieldClass} value={text('source')} maxLength={160} onChange={(e) => set('source', e.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            Ano <span className="font-normal text-graphite-400">(negativo = a.C.)</span>
            <input
              type="number"
              className={fieldClass}
              value={form.year ?? ''}
              onChange={(e) => set('year', e.target.value === '' ? null : Number(e.target.value))}
            />
          </label>
        </div>

        <label className="block text-sm font-semibold">
          Explicação do conceito *
          <textarea rows={4} className={fieldClass} value={form.summary} onChange={(e) => set('summary', e.target.value)} required minLength={10} />
        </label>
        {area('context', 'Contexto histórico, social ou cultural')}
        {area('importance', 'Importância sociocultural')}
        {area('essayUse', 'Como usar na redação')}
        {area('example', 'Exemplo de uso argumentativo', '(um trecho para adaptar)')}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Temas relacionados <span className="font-normal text-graphite-400">(separe com ;)</span>
            <input className={fieldClass} value={themes} onChange={(e) => setThemes(e.target.value)} placeholder="Desigualdade digital; consumo" />
          </label>
          <label className="block text-sm font-semibold">
            Palavras-chave <span className="font-normal text-graphite-400">(separe com vírgula)</span>
            <input className={fieldClass} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="consumo, fluidez" />
          </label>
        </div>
        {area('notes', 'Minhas anotações')}

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!form.isFavorite} onChange={(e) => set('isFavorite', e.target.checked)} /> Favorito
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!form.isStudied} onChange={(e) => set('isStudied', e.target.checked)} /> Já domino
          </label>
          {canPublish ? (
            <label className="flex items-center gap-2 font-semibold text-primary-700">
              <input type="checkbox" checked={!!form.isPlatform} onChange={(e) => set('isPlatform', e.target.checked)} /> Publicar no acervo da Lumina
            </label>
          ) : null}
        </div>

        {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar repertório
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
        </div>
      </form>
    </Modal>
  );
}
