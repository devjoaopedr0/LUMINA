import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessToken } from '@/lib/auth';
import { apiAnswerKeySheet, ApiError, type AnswerKeySheet } from '@/lib/api';
import { Sheet } from '@/pages/AnswerSheetPrint';

/** Cartão-resposta da Lumina para marcar as respostas de um gabarito e depois fotografar. */
export function SmartAnswerKeySheet() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState<AnswerKeySheet | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    apiAnswerKeySheet(getAccessToken() ?? '', id).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : 'Não foi possível gerar o cartão.'));
  }, [id]);
  const name = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || null : null;
  return (
    <main className="min-h-screen bg-surface-card px-4 py-6 text-graphite print:bg-white print:p-0">
      <style>{`@page { size: A4; margin: 0; } @media print { .no-print { display: none !important; } }`}</style>
      <div className="no-print mx-auto mb-6 max-w-3xl">
        <Link to="/app/gabarito-inteligente" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Gabarito Inteligente</Link>
        <h1 className="mt-4 text-2xl font-bold">Cartão-resposta para marcar</h1>
        <p className="mt-2 text-sm text-graphite-500">Imprima em A4, em <strong>tamanho real (100%)</strong>. Marque suas respostas enquanto resolve a prova e depois fotografe o cartão em "Ler foto do cartão": a leitura preenche a grade e você confere antes de corrigir.</p>
        {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</p> : null}
        {data ? <Button className="mt-4" onClick={() => window.print()}><Printer size={18} />Imprimir</Button> : !error ? <p role="status" className="mt-4">Gerando o cartão…</p> : null}
      </div>
      {data ? <div className="mx-auto max-w-[210mm] bg-white shadow print:shadow-none"><Sheet layout={data.layout} title={data.title} className={null} studentName={name} code={data.code} bits={data.bits} /></div> : null}
    </main>
  );
}
