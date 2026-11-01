import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Lock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getAccessToken } from '@/lib/auth';
import { needsReview } from '@/lib/answer-sheet';
import { apiAnswerSheetFinalize, apiAnswerSheetImageUrl, apiAnswerSheetReview, ApiError, type AnswerSheetQuestion, type AnswerSheetScan } from '@/lib/api';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const STATUS_TEXT: Record<AnswerSheetQuestion['status'], string> = { OK: 'lida', BLANK: 'em branco', MULTIPLE: 'mais de uma marcação', AMBIGUOUS: 'duvidosa' };

/**
 * Conferência do corretor: a folha digitalizada com cada bolha desenhada por
 * cima. Tocar numa bolha marca aquela alternativa; tocar de novo deixa em
 * branco. Vale para qualquer questão — inclusive uma bolha pintada que a
 * leitura não pegou. As duvidosas aparecem em amarelo e precisam de decisão.
 */
export function AnswerSheetConference({ scan, onSaved }: { scan: AnswerSheetScan; onSaved: (scan: AnswerSheetScan) => void }) {
  const read = useMemo(() => Object.fromEntries(scan.questions.map((q) => [q.number, q.selected ?? 0])), [scan.questions]);
  const saved = useMemo(() => Object.fromEntries(scan.questions.map((q) => [q.number, scan.answers[String(q.number)] ?? q.selected ?? 0])), [scan.answers, scan.questions]);
  const [answers, setAnswers] = useState<Record<number, number>>(saved);
  const [decided, setDecided] = useState<Set<number>>(new Set());
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const posted = scan.status === 'COMPLETED';
  const finalized = Boolean(scan.result?.finalizedAt);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const doubtful = useMemo(() => (posted ? [] : scan.questions.filter(needsReview).map((q) => q.number)), [posted, scan.questions]);

  useEffect(() => {
    setAnswers(saved);
    setDecided(new Set());
  }, [saved]);

  useEffect(() => {
    let url = '';
    let active = true;
    if (scan.hasImage) {
      apiAnswerSheetImageUrl(getAccessToken() ?? '', scan.id)
        .then((u) => {
          url = u;
          if (active) setImageUrl(u);
          else URL.revokeObjectURL(u);
        })
        .catch(() => setError('Não foi possível carregar a imagem da folha.'));
    }
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [scan.hasImage, scan.id]);

  async function finalize() {
    setBusy(true);
    setError('');
    try {
      onSaved(await apiAnswerSheetFinalize(getAccessToken() ?? '', scan.id));
      setConfirmFinal(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível finalizar a correção.');
    } finally {
      setBusy(false);
    }
  }

  function choose(number: number, position: number) {
    if (finalized) return;
    // Duvidosa ainda sem decisão: o primeiro toque sempre marca (não apaga a pré-leitura).
    const firstTouchOnDoubt = doubtful.includes(number) && !decided.has(number);
    setAnswers((a) => ({ ...a, [number]: !firstTouchOnDoubt && a[number] === position ? 0 : position }));
    setDecided((d) => new Set(d).add(number));
  }

  function keep(number: number) {
    setDecided((d) => new Set(d).add(number));
  }

  const changes = scan.questions.filter((q) => answers[q.number] !== saved[q.number]).map((q) => q.number);
  const missing = doubtful.filter((n) => !decided.has(n));
  const adjustedFromReading = scan.questions.filter((q) => answers[q.number] !== read[q.number]).map((q) => q.number);

  async function save() {
    setBusy(true);
    setError('');
    try {
      const touched = new Set([...changes, ...doubtful]);
      const payload = [...touched].map((number) => ({ number, selected: answers[number] ?? 0 }));
      onSaved(await apiAnswerSheetReview(getAccessToken() ?? '', scan.id, payload));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível salvar a conferência.');
    } finally {
      setBusy(false);
    }
  }

  const w = scan.image.width ?? 1100;
  const h = scan.image.height ?? 1556;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="bg-white p-3 sm:p-4">
        <p className="mb-2 text-sm text-graphite-500">{finalized ? 'Correção finalizada: a folha está travada.' : 'Toque na bolha certa para corrigir a leitura. Tocar de novo deixa a questão em branco.'}</p>
        <div className="relative w-full overflow-hidden rounded-lg border border-surface-line bg-surface-card" style={{ aspectRatio: `${w} / ${h}` }}>
          {imageUrl ? <img src={imageUrl} alt="Folha digitalizada" className="absolute inset-0 h-full w-full" draggable={false} /> : <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin" /></div>}
          <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 h-full w-full" role="group" aria-label="Bolhas do cartão">
            {scan.questions.map((q) => {
              const isDoubt = doubtful.includes(q.number) && !decided.has(q.number);
              return q.bubbles.map((b, i) => {
                const position = i + 1;
                const chosen = answers[q.number] === position;
                const changed = chosen && read[q.number] !== position;
                return (
                  <circle
                    key={`${q.number}-${position}`}
                    cx={b.x}
                    cy={b.y}
                    r={b.r * 1.45}
                    role="checkbox"
                    aria-checked={chosen}
                    aria-label={`Questão ${q.number}, alternativa ${LETTERS[i]}`}
                    tabIndex={finalized ? -1 : 0}
                    aria-disabled={finalized}
                    onClick={() => !busy && choose(q.number, position)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!busy) choose(q.number, position); } }}
                    fill={chosen ? (changed ? 'rgba(37,99,235,0.35)' : 'rgba(16,185,129,0.3)') : isDoubt ? 'rgba(250,204,21,0.25)' : 'transparent'}
                    stroke={chosen ? (changed ? '#2563eb' : '#059669') : isDoubt ? '#ca8a04' : 'transparent'}
                    strokeWidth={Math.max(2, b.r * 0.25)}
                    className={finalized ? 'outline-none' : 'cursor-pointer outline-none hover:stroke-graphite focus:stroke-graphite'}
                  />
                );
              });
            })}
          </svg>
        </div>
        <p className="mt-2 flex flex-wrap gap-4 text-xs text-graphite-500">
          <span><span className="mr-1 inline-block h-3 w-3 rounded-full border-2 border-emerald-600 align-middle" />lida pela leitura</span>
          <span><span className="mr-1 inline-block h-3 w-3 rounded-full border-2 border-blue-600 align-middle" />ajustada por você</span>
          <span><span className="mr-1 inline-block h-3 w-3 rounded-full border-2 border-yellow-600 align-middle" />duvidosa</span>
        </p>
      </Card>

      <div className="space-y-4">
        <Card className="bg-white">
          <h3 className="font-semibold">{finalized ? 'Correção finalizada' : posted ? 'Nota lançada' : 'Conferência'}</h3>
          {posted && scan.result ? <p className="mt-1 text-2xl font-bold">{scan.result.correct}<span className="text-sm font-normal text-graphite-400"> / {scan.result.total} acertos</span></p> : null}
          {missing.length ? (
            <div className="mt-2 text-sm text-amber-800">
              <p>Decida as duvidosas: toque na bolha certa na folha, ou mantenha o que a leitura achou.</p>
              <ul className="mt-2 space-y-1">
                {missing.map((n) => (
                  <li key={n} className="flex items-center justify-between gap-2">
                    <span>Q{n}: {answers[n] ? `leitura achou ${LETTERS[answers[n] - 1]}` : 'leitura achou em branco'}</span>
                    <Button variant="outline" size="sm" onClick={() => keep(n)}>Manter</Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : !posted ? <p className="mt-2 text-sm text-graphite-500">Nada pendente. Confira a folha e lance a nota.</p> : finalized ? (
            <p className="mt-2 text-sm text-graphite-500">Finalizada em {new Date(scan.result!.finalizedAt!).toLocaleString('pt-BR')}. O domínio por tópico do aluno foi atualizado com estas respostas.</p>
          ) : (
            <p className="mt-2 text-sm text-graphite-500">Viu algo errado? Ajuste na folha e salve a correção. O domínio por tópico do aluno só é atualizado quando você finalizar — depois disso a folha não muda mais.</p>
          )}
          {adjustedFromReading.length ? <p className="mt-2 text-sm text-blue-700">Ajustadas em relação à leitura: {adjustedFromReading.map((n) => `Q${n}`).join(', ')}.</p> : null}
          {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {!finalized ? <Button disabled={busy || missing.length > 0 || (posted && !changes.length)} onClick={() => void save()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {posted ? 'Salvar correção da nota' : 'Confirmar e lançar a nota'}
            </Button> : null}
            {changes.length ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setAnswers(saved); setDecided(new Set()); }}><RotateCcw size={14} />Desfazer</Button> : null}
          </div>
          {posted && scan.result && !finalized ? (
            <div className="mt-4 border-t border-surface-line pt-4">
              {confirmFinal ? (
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  <p>Finalizar aplica o domínio por tópico com estas respostas e trava a folha. Não dá para desfazer.</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" disabled={busy || changes.length > 0} onClick={() => void finalize()}><Lock size={14} />Finalizar agora</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmFinal(false)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" disabled={busy || changes.length > 0} onClick={() => setConfirmFinal(true)}><Lock size={16} />Finalizar correção</Button>
              )}
              {changes.length ? <p className="mt-2 text-xs text-graphite-400">Salve a correção da nota antes de finalizar.</p> : null}
            </div>
          ) : null}
        </Card>
        <Card className="bg-white">
          <h3 className="text-sm font-semibold">Respostas</h3>
          <ol className="mt-2 grid grid-cols-5 gap-1.5 text-xs">
            {scan.questions.map((q) => {
              const value = answers[q.number] ?? 0;
              const isDoubt = doubtful.includes(q.number) && !decided.has(q.number);
              const changed = value !== read[q.number];
              return (
                <li key={q.number} title={`${STATUS_TEXT[q.status]} · confiança ${Math.round(q.confidence * 100)}%`} className={`rounded px-1 py-0.5 text-center ${isDoubt ? 'bg-amber-100 text-amber-900' : changed ? 'bg-blue-50 text-blue-800' : value ? 'bg-surface-card' : 'bg-red-50 text-red-700'}`}>
                  <span className="block text-[10px] text-graphite-400">{q.number}</span>
                  <span className="font-bold">{isDoubt ? '?' : value ? LETTERS[value - 1] : '—'}</span>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </div>
  );
}
