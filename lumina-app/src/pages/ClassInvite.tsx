import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getAccessToken } from '@/lib/auth';
import { apiAcceptClassInvite, ApiError } from '@/lib/api';

/** Entrada na turma pelo link de convite do professor (vale também para aluno independente). */
export function ClassInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    apiAcceptClassInvite(getAccessToken() ?? '', token)
      .then((row) => navigate(`/app/turmas?id=${row.id}`, { replace: true }))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Não foi possível entrar na turma.'));
  }, [token, navigate]);

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite">
      <div className="mx-auto max-w-xl rounded-2xl border bg-white p-6">
        <h1 className="text-2xl font-bold">Convite para turma</h1>
        {error ? (
          <>
            <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>
            <Link to="/app" className="mt-4 inline-block underline">Voltar à visão geral</Link>
          </>
        ) : <p role="status" className="mt-4">Entrando na turma…</p>}
      </div>
    </main>
  );
}
