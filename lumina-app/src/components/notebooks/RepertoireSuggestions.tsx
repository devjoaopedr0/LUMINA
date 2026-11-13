import { useState, type FormEvent } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { fieldClass } from '@/lib/notebook-ui';
import { ApiError, apiRepertoireAi } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { REFERENCE_TYPE_LABEL, categoryLabel, type RepertoireSuggestion } from '@/lib/notebooks';

/**
 * Sugestões da LuminIA para um tema. Nada entra no caderno direto: "Revisar e
 * salvar" abre o formulário preenchido para o aluno conferir antes.
 */
export function RepertoireSuggestions({
  initialTheme = '',
  onReview,
}: {
  initialTheme?: string;
  onReview: (suggestion: RepertoireSuggestion, theme: string) => void;
}) {
  const [theme, setTheme] = useState(initialTheme);
  const [asked, setAsked] = useState('');
  const [suggestions, setSuggestions] = useState<RepertoireSuggestion[]>([]);
  const [disclaimer, setDisclaimer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function suggest(event: FormEvent) {
    event.preventDefault();
    const value = theme.trim();
    if (value.length < 3) return setError('Escreva o tema da redação.');
    setBusy(true);
    setError('');
    setSuggestions([]);
    try {
      const result = await apiRepertoireAi(getAccessToken() ?? '', { action: 'suggest', theme: value });
      setSuggestions(result.suggestions ?? []);
      setDisclaimer(result.disclaimer);
      setAsked(value);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'A LuminIA não respondeu. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={(e) => void suggest(e)} className="flex flex-col gap-2 sm:flex-row">
        <input className={`${fieldClass} mt-0`} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Tema da redação, ex.: Desafios da educação a distância" aria-label="Tema da redação" />
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Sugerir repertórios
        </Button>
      </form>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      {suggestions.length ? (
        <ul className="mt-4 space-y-3">
          {suggestions.map((s) => (
            <li key={s.title} className="rounded-2xl border border-surface-line p-4 text-sm">
              <p className="font-bold">{s.title}</p>
              <p className="text-xs text-graphite-500">
                {[s.author, categoryLabel(s.category), REFERENCE_TYPE_LABEL[s.referenceType]].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-2"><span className="font-semibold">Relação com o tema:</span> {s.relation}</p>
              {s.howToArgue ? <p className="mt-1"><span className="font-semibold">Como argumentar:</span> {s.howToArgue}</p> : null}
              {s.example ? <p className="mt-1 italic text-graphite-600">{s.example}</p> : null}
              {s.verify ? <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Conferir antes de usar: {s.verify}</p> : null}
              <Button size="sm" variant="outline" className="mt-3" onClick={() => onReview(s, asked)}>Revisar e salvar</Button>
            </li>
          ))}
        </ul>
      ) : null}
      {disclaimer && suggestions.length ? <p className="mt-3 text-xs text-graphite-400">{disclaimer}</p> : null}
    </div>
  );
}
