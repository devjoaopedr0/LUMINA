import { useEffect, useState, type FormEvent } from 'react';
import { Megaphone } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { ApiError, apiBroadcast, apiBroadcastTargets } from '@/lib/api';
import type { BroadcastTargets } from '@/lib/institution';

/** Aviso do professor para a turma, ou da coordenação/direção para a instituição (item 51). */
export function NoticeComposer() {
  const [targets, setTargets] = useState<BroadcastTargets | null>(null);
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    apiBroadcastTargets(token)
      .then((t) => {
        setTargets(t);
        setTarget(t.classes[0] ? `class:${t.classes[0].id}` : t.institution ? 'institution' : '');
      })
      .catch(() => setTargets(null));
  }, []);

  if (!targets || (!targets.classes.length && !targets.institution)) return null;

  async function send(event: FormEvent) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload = target === 'institution'
        ? { scope: 'institution' as const, title, body: body || undefined }
        : { scope: 'class' as const, classId: target.replace('class:', ''), title, body: body || undefined };
      const res = await apiBroadcast(token, payload);
      setMessage({ ok: true, text: `Aviso enviado para ${res.sent} ${res.sent === 1 ? 'pessoa' : 'pessoas'} (${res.audience}).` });
      setTitle('');
      setBody('');
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : 'Não foi possível enviar o aviso.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="my-6 rounded-xl border bg-white p-5">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold"><Megaphone size={16} />Enviar aviso</summary>
      <form onSubmit={send} className="mt-4 space-y-3 text-sm">
        <label className="block">Para quem
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2">
            {targets.institution && <option value="institution">Toda a instituição ({targets.institution.name})</option>}
            {targets.classes.map((c) => <option key={c.id} value={`class:${c.id}`}>Turma {c.name}</option>)}
          </select>
        </label>
        <label className="block">Título
          <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={120} placeholder="Ex.: Simulado geral no sábado" className="mt-1 w-full rounded-lg border p-2" />
        </label>
        <label className="block">Mensagem <span className="text-graphite-500">(opcional)</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} rows={2} className="mt-1 w-full rounded-lg border p-2" />
        </label>
        <p className="text-xs text-graphite-500">Aparece no sino de notificações de cada aluno. Até {targets.dailyLimit} avisos por dia.</p>
        <button type="submit" disabled={busy || title.trim().length < 3} className="rounded-full bg-graphite px-4 py-2 font-semibold text-white disabled:opacity-60">Enviar aviso</button>
        {message && <p role="status" className={message.ok ? 'text-emerald-700' : 'text-red-700'}>{message.text}</p>}
      </form>
    </details>
  );
}
