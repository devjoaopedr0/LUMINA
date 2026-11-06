import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, BarChart3, ClipboardList, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { apiEssayReviewDivergences, type EssayReviewDivergenceReport } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Badge } from '@/components/essays/essay-review-ui';

export function EssayReviewDivergencesPage() {
  const [report, setReport] = useState<EssayReviewDivergenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      setReport(await apiEssayReviewDivergences(getAccessToken() ?? ''));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar o relatório de divergências.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link to="/app/revisoes" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Voltar à fila</Link>
        <header className="my-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-primary-700"><BarChart3 size={18} />Aprendizagem e calibração</p>
            <h1 className="mt-2 text-3xl font-bold">Padrões de divergência</h1>
            <p className="mt-2 max-w-3xl text-sm text-graphite-500">Compare a leitura da IA com avaliadores humanos por competência, critério e caso concreto. O objetivo não é reduzir tudo a uma média: é localizar onde a interpretação precisa ser revista.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} />Atualizar</Button>
            <Link to="/app/revisoes"><Button variant="outline"><ClipboardList size={16} />Fila de revisões</Button></Link>
          </div>
        </header>

        {loading ? <p role="status" className="flex items-center gap-2 text-sm text-graphite-500"><Loader2 size={16} className="animate-spin" />Calculando divergências.</p> : null}
        {error ? <Card className="border-red-200 bg-red-50"><p role="alert" className="flex items-center gap-2 font-semibold text-red-800"><AlertTriangle size={17} />Relatório indisponível</p><p className="mt-2 text-sm text-red-700">{error}</p><p className="mt-2 text-xs text-red-600">O relatório é restrito a avaliadores com acesso às revisões.</p><Button className="mt-3" variant="outline" onClick={() => void load()}>Tentar novamente</Button></Card> : null}

        {report ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Card className="bg-white p-4"><p className="text-xs font-semibold text-graphite-500">Revisões analisadas</p><p className="mt-1 text-3xl font-bold">{report.summary.reviews}</p></Card>
              <Card className="bg-white p-4"><p className="text-xs font-semibold text-graphite-500">Com divergência</p><p className="mt-1 text-3xl font-bold text-red-700">{report.summary.disputed}</p></Card>
              <Card className="bg-white p-4"><p className="text-xs font-semibold text-graphite-500">Validadas</p><p className="mt-1 text-3xl font-bold">{report.summary.validated}</p></Card>
              <Card className="bg-white p-4"><p className="text-xs font-semibold text-graphite-500">Consolidadas</p><p className="mt-1 text-3xl font-bold text-emerald-700">{report.summary.consolidated}</p></Card>
              <Card className="bg-white p-4"><p className="text-xs font-semibold text-graphite-500">Diferença média total</p><p className="mt-1 text-3xl font-bold">{report.summary.averageTotalDifference}</p><p className="text-[11px] text-graphite-400">pontos entre total humano e IA</p></Card>
            </div>

            <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
              <p className="font-semibold">Leitura correta do relatório</p>
              <p className="mt-1">{report.note} Use os exemplos para discutir critérios e prepare a calibração supervisionada apenas depois da validação independente.</p>
            </div>

            {report.summary.topCriteria.length ? (
              <Card className="mt-5 bg-white">
                <h2 className="text-lg font-semibold">Critérios mais discutidos</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {report.summary.topCriteria.map((item) => <Badge key={item.criterion} tone="warn">{item.criterion} · {item.count}</Badge>)}
                </div>
              </Card>
            ) : null}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {report.byCompetency.map((bucket) => {
                const max = Math.max(1, bucket.maxDifference);
                return (
                  <Card key={bucket.competency} className="bg-white">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-primary-700">{bucket.competency}</p>
                        <h2 className="text-lg font-semibold">{bucket.label}</h2>
                        <p className="mt-1 text-xs text-graphite-500">{bucket.reviews} revisão(ões) · {bucket.disagreements} com nota diferente</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">{bucket.averageDifference}</p>
                        <p className="text-[11px] text-graphite-400">diferença média absoluta</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs"><span>Diferença média</span><span className="font-semibold">{bucket.averageDifference} pts</span></div>
                      <div className="h-2 rounded-full bg-surface-card"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, (bucket.averageDifference / 200) * 100)}%` }} /></div>
                      <div className="flex items-center justify-between text-xs"><span>Maior diferença</span><span className="font-semibold">{bucket.maxDifference} pts</span></div>
                      <div className="h-2 rounded-full bg-surface-card"><div className="h-2 rounded-full bg-amber-400" style={{ width: `${Math.min(100, (max / 200) * 100)}%` }} /></div>
                      <p className="text-[11px] text-graphite-400">Diferença assinada média: {bucket.averageSignedDifference > 0 ? '+' : ''}{bucket.averageSignedDifference} pts</p>
                    </div>
                    {Object.keys(bucket.criteria).length ? (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-graphite-700">Critérios citados</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">{Object.entries(bucket.criteria).sort(([, a], [, b]) => b - a).slice(0, 5).map(([criterion, count]) => <Badge key={criterion}>{criterion} · {count}</Badge>)}</div>
                      </div>
                    ) : null}
                    {bucket.examples.length ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-semibold text-graphite-700">Casos para estudo</p>
                        {bucket.examples.map((example) => (
                          <Link key={example.reviewId} to={`/app/redacoes/${example.essayId}/revisao`} className="flex items-center justify-between gap-2 rounded-xl border border-surface-line px-3 py-2 text-xs transition hover:border-primary">
                            <span><strong>{example.aiScore} → {example.humanScore}</strong>{example.justification ? <span className="ml-2 text-graphite-500">{example.justification.slice(0, 120)}{example.justification.length > 120 ? '…' : ''}</span> : null}</span>
                            <ArrowRight size={13} className="shrink-0 text-primary-700" />
                          </Link>
                        ))}
                      </div>
                    ) : <p className="mt-3 text-xs text-graphite-400">Nenhum exemplo concreto registrado nesta competência.</p>}
                  </Card>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
