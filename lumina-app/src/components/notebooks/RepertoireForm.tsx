import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/notebooks/Modal';
import { fieldClass } from '@/lib/notebook-ui';
import {
  ARGUMENT_FUNCTIONS,
  AXIS_LABEL,
  FUNCTION_LABEL,
  REPERTOIRE_AXES,
  type ArgumentFunction,
  type RepertoireAxis,
  CATEGORY_LABEL,
  REFERENCE_TYPE_LABEL,
  REFERENCE_TYPES,
  REPERTOIRE_CATEGORIES,
  isCustomCategory,
  type ReferenceType,
  type RepertoirePayload,
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
  const [concepts, setConcepts] = useState((initial.concepts ?? []).join(', '));
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
        concepts: concepts.split(',').map((c) => c.trim()).filter(Boolean),
        // Citação literal sem fonte não é aceita: vira anotação para conferir.
        ...(form.quote?.trim() && !form.quoteSource?.trim() ? { quote: null, notes: [form.notes, `Citação a conferir (sem fonte): ${form.quote.trim()}`].filter(Boolean).join('\n\n') } : {}),
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
            <span aria-hidden="true" />
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

        <ChipGroup
          legend="Eixos temáticos"
          options={REPERTOIRE_AXES}
          labels={AXIS_LABEL}
          value={form.axes ?? []}
          onChange={(axes) => set('axes', axes as RepertoireAxis[])}
        />
        <ChipGroup
          legend="Função na argumentação (mapa de aplicação)"
          options={ARGUMENT_FUNCTIONS}
          labels={FUNCTION_LABEL}
          value={form.argumentFunctions ?? []}
          onChange={(fns) => set('argumentFunctions', fns as ArgumentFunction[])}
        />

        {area('context', '2. Contexto histórico e social')}
        <label className="block text-sm font-semibold">
          3. Ideia central * <span className="font-normal text-graphite-400">(com suas palavras: paráfrase)</span>
          <textarea rows={4} className={fieldClass} value={form.summary} onChange={(e) => set('summary', e.target.value)} required minLength={10} />
        </label>
        <label className="block text-sm font-semibold">
          4. Conceitos fundamentais <span className="font-normal text-graphite-400">(separe com vírgula)</span>
          <input className={fieldClass} value={concepts} onChange={(e) => setConcepts(e.target.value)} placeholder="capital cultural, habitus" />
        </label>
        {area('socialProblems', '5. Problemas sociais que ajuda a explicar')}
        {area('brazilRelation', '6. Relação com a realidade brasileira')}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          {area('example', '8. Exemplo de aplicação', '(um parágrafo de desenvolvimento)')}
          <label className="block text-sm font-semibold">
            Desenvolvimento
            <select className={fieldClass} value={form.exampleSlot ?? ''} onChange={(e) => set('exampleSlot', (e.target.value || null) as 'D1' | 'D2' | null)}>
              <option value="">—</option>
              <option value="D1">D1</option>
              <option value="D2">D2</option>
            </select>
          </label>
        </div>
        {area('connections', '9. Conexões com outros repertórios')}
        {area('pitfalls', '10. Cuidados para não usar de forma decorativa')}
        {area('essayUse', 'Como usar na redação (resumo)')}
        {area('importance', 'Importância sociocultural')}

        <fieldset className="rounded-xl border border-surface-line p-3">
          <legend className="px-1 text-sm font-semibold">Citação literal (opcional)</legend>
          <p className="text-xs text-graphite-500">Só copie palavra por palavra se tiver a fonte exata (obra e página). Sem fonte, a citação vai para as anotações como "a conferir".</p>
          <textarea rows={2} className={fieldClass} value={form.quote ?? ''} onChange={(e) => set('quote', e.target.value)} />
          <input className={fieldClass} value={form.quoteSource ?? ''} maxLength={300} onChange={(e) => set('quoteSource', e.target.value)} placeholder="Fonte exata: obra, edição, página" />
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            7. Temas de redação <span className="font-normal text-graphite-400">(separe com ;)</span>
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

/** Grupo de opções marcáveis (eixos, funções). */
function ChipGroup({ legend, options, labels, value, onChange }: { legend: string; options: readonly string[]; labels: Record<string, string>; value: string[]; onChange: (value: string[]) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const on = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== option) : [...value, option])}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? 'border-primary bg-primary/15 text-primary-700' : 'border-surface-line text-graphite-600'}`}
            >
              {labels[option] ?? option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
