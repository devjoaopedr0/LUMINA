import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, ChartNoAxesCombined, ClipboardCheck, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { apiEssayReviewQueue, type EssayReviewQueueItem } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Badge, LearningLevelBadge, ReviewStatusBadge, ScoreDelta, formatDateTime } from '@/components/essays/essay-review-ui';

const FILTERS = [
  { value: 'ALL', label: 'Todas' },
  { value: 'SUBMITTED', label: 'Enviadas' },
  { value: 'DISPUTED', label: 'Divergentes' },
  { value: 'ACCEPTED', label: 'Aceitas' },
] as const;

type Filter = (typeof FILTERS)[number]['value'];

export function EssayReviewQueuePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<EssayReviewQueueItem[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await apiEssayReviewQueue(getAccessToken() ?? '');
      setItems(response.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a fila de revisões.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => filter === 'ALL' ? items : items.filter((item) => item.status === filter), [filter, items]);
  const counts = useMemo(() => ({
    submitted: items.filter((item) => item.status === 'SUBMITTED').length,
    disputed: items.filter((item) => item.status === 'DISPUTED').length,
    validated: items.filter((item) => item.validationLevel === 'VALIDATED').length,
    consolidated: items.filter((item) => item.validationLevel === 'CONSOLIDATED').length,
  }), [items]);

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Voltar à visão geral</Link>
        <header className="my-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-primary-700"><ClipboardCheck size={18} />Revisão humana</p>
            <h1 className="mt-2 text-3xl font-bold">Fila de revisões</h1>
            <p className="mt-2 max-w-3xl text-sm text-graphite-500">Confronte a correção da IA com critérios oficiais, registre divergências com evidência e encaminhe o aprendizado para validação independente.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} />Atualizar</Button>
            <Link to="/app/revisoes/divergencias"><Button><ChartNoAxesCombined size={16} />Relatório de divergências</Button></Link>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-white p-4"><p className="text-xs font-semibold text-graphite-500">Aguardando análise</p><p className="mt-1 text-3xl font-bold">{counts.submitted}</p><p className="text-[11px] text-graphite-400">revisões enviadas</p></Card>
          <Card className="bg-white p-4"><p className="text-xs font-semibold text-graphite-500">Divergências relevantes</p><p className="mt-1 text-3xl font-bold text-red-700">{counts.disputed}</p><p className="text-[11px] text-graphite-400">acima do limite operacional</p></Card>
          <Card className="bg-white p-4"><p className="text-xs font-semibold text-graphite-500">Validadas</p><p className="mt-1 text-3xl font-bold">{counts.validated}</p><p className="text-[11px] text-graphite-400">por avaliador independente</p></Card>
          <Card className="bg-white p-4"><p className="text-xs font-semibold text-graphite-500">Consolidadas</p><p className="mt-1 text-3xl font-bold text-emerald-700">{counts.consolidated}</p><p className="text-[11px] text-graphite-400">disponíveis para RAG</p></Card>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar revisões">
            {FILTERS.map((option) => (
              <Button key={option.value} size="sm" variant={filter === option.value ? 'primary' : 'outline'} onClick={() => setFilter(option.value)}>{option.label}</Button>
            ))}
          </div>
          <p className="text-xs text-graphite-400">{filtered.length} revisão(ões) · escopo de {user?.accountType === 'ADMIN' ? 'administração' : 'suas turmas e workspace'}</p>
        </div>

        {loading ? <p role="status" className="mt-6 flex items-center gap-2 text-sm text-graphite-500"><Loader2 size={16} className="animate-spin" />Carregando revisões.</p> : null}
        {error ? (
          <Card className="mt-6 border-red-200 bg-red-50">
            <p role="alert" className="flex items-center gap-2 font-semibold text-red-800"><AlertTriangle size={17} />Acesso ou carregamento indisponível</p>
            <p className="mt-2 text-sm text-red-700">{error}</p>
            <p className="mt-2 text-xs text-red-600">A fila é restrita a professores, coordenação, direção, administração ou membros com permissão de revisão no workspace.</p>
            <Button className="mt-3" variant="outline" onClick={() => void load()}>Tentar novamente</Button>
          </Card>
        ) : null}

        {!loading && !error && !filtered.length ? (
          <Card className="mt-6 bg-white p-8">
            <h2 className="text-lg font-semibold">Nenhuma revisão neste filtro</h2>
            <p className="mt-2 text-sm text-graphite-500">As revisões aparecem quando um avaliador envia notas humanas para uma correção de IA concluída.</p>
            <p className="mt-2 text-xs text-graphite-400">Abra uma redação da sua turma para iniciar a revisão.</p>
          </Card>
        ) : null}

        <div className="mt-4 space-y-3">
          {filtered.map((item) => (
            <Link key={item.id} to={`/app/redacoes/${item.essay.id}/revisao`} className="block rounded-2xl focus-visible:outline-primary">
              <Card className="bg-white p-4 transition hover:border-primary sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ReviewStatusBadge status={item.status} />
                      <LearningLevelBadge level={item.validationLevel} />
                      {item.divergence?.discrepant ? <Badge tone="bad">Divergência</Badge> : <Badge tone="good">Sem discrepância</Badge>}
                    </div>
                    <h2 className="mt-2 break-words text-lg font-semibold">{item.essay.title || 'Redação sem título'}</h2>
                    <p className="mt-1 break-words text-sm text-graphite-500">{item.essay.theme || 'Tema livre'} · {item.essay.owner} · versão {item.essay.version}</p>
                    <p className="mt-1 text-[11px] text-graphite-400">Avaliador: {item.evaluator.name} · atualizada em {formatDateTime(item.updatedAt)}</p>
                  </div>
                  <div className="min-w-[180px] text-right">
                    <p className="text-xs text-graphite-500">IA → humano</p>
                    <p className="mt-1 text-xl font-bold">{item.aiTotalScore} <span className="text-graphite-400">→</span> {item.totalScore}</p>
                    <p className="mt-1"><ScoreDelta aiScore={item.aiTotalScore} humanScore={item.totalScore} total /></p>
                    <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-700">Abrir revisão <ArrowRight size={14} /></p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-surface-line pt-3">
                  {item.competencies.map((competency) => (
                    <span key={competency.competency} className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${competency.aiScore === competency.humanScore ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                      {competency.competency} {competency.aiScore}→{competency.humanScore}
                    </span>
                  ))}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
