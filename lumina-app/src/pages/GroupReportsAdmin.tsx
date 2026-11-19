import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { ApiError, apiAdminGroupReports, apiAdminResolveGroupReport } from '@/lib/api';
import { REASON_LABEL, timeAgo, type AdminGroupReport } from '@/lib/group-chat';

const TARGET_LABEL: Record<AdminGroupReport['targetType'], string> = {
  GROUP: 'Grupo inteiro',
  MEMBER: 'Dono do grupo',
  MESSAGE: 'Mensagem do dono',
};

/** Denúncias que só a administração da Lumina trata: grupos inteiros e donos. */
export function GroupReportsAdmin() {
  const [rows, setRows] = useState<AdminGroupReport[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    apiAdminGroupReports(token)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as denúncias.'));
  }, []);

  async function resolve(id: string, action: 'resolve' | 'dismiss') {
    const token = getAccessToken();
    if (!token) return;
    try {
      setRows(await apiAdminResolveGroupReport(token, id, action));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível tratar a denúncia.');
    }
  }

  return (
    <main className="min-h-screen bg-surface-card px-4 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link to="/app/grupos" className="inline-flex items-center gap-1 text-sm font-semibold"><ArrowLeft size={15} />Grupos</Link>
        <h1 className="mt-6 flex items-center gap-2 text-2xl font-bold"><ShieldAlert size={22} />Denúncias de grupos</h1>
        <p className="mt-1 text-sm text-graphite-500">Grupos inteiros e denúncias contra donos de grupo vêm para a administração da Lumina.</p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!rows && !error && <p role="status" className="mt-6">Carregando…</p>}
        {rows?.length === 0 && <p className="mt-6 rounded-2xl border bg-white p-6">Nenhuma denúncia aberta.</p>}
        <ul className="mt-6 space-y-3">
          {rows?.map((r) => (
            <li key={r.id} className="rounded-2xl border bg-white p-4 text-sm">
              <p className="font-semibold">{r.groupName} · {TARGET_LABEL[r.targetType]}{r.targetName ? ` (${r.targetName})` : ''}</p>
              <p className="text-graphite-500">{REASON_LABEL[r.reason]} · {timeAgo(r.createdAt)}</p>
              {r.messageBody && <p className="mt-2 rounded bg-surface-card p-2 text-xs">“{r.messageBody}”</p>}
              {r.details && <p className="mt-2 text-xs">Detalhes: {r.details}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void resolve(r.id, 'resolve')} className="rounded-full bg-graphite px-3 py-1 text-xs font-semibold text-white">Procede</button>
                <button type="button" onClick={() => void resolve(r.id, 'dismiss')} className="rounded-full border px-3 py-1 text-xs font-semibold">Não procede</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
