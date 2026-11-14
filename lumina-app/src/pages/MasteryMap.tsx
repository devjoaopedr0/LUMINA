import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Filter,
  RotateCcw,
  Search,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MasteryEvolutionCard } from '@/components/MasteryEvolutionCard';
import { Card } from '@/components/ui/Card';
import { apiGetTopicMastery, type TopicMasteryEntry } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import {
  MASTERY_BANDS,
  MASTERY_BAND_CLASS,
  MASTERY_BAND_HINT,
  MASTERY_BAND_LABEL,
  MASTERY_HEAT_CLASS,
  MASTERY_STATUS_LABEL,
  filterMastery,
  groupMasteryBySubject,
  hasMasteryFilters,
  heatClass,
  masteryAccuracy,
  masteryBand,
  masteryReviewLabel,
  summarizeMastery,
  dominantMasteryBand,
  type MasteryBand,
} from '@/lib/topic-mastery';

const token = () => getAccessToken() ?? '';

const EMPTY_ENTRIES: TopicMasteryEntry[] = [];

const HEAT_LEGEND = [
  { level: 0 as const, label: 'Sem tentativa' },
  { level: 1 as const, label: '1–24' },
  { level: 2 as const, label: '25–49' },
  { level: 3 as const, label: '50–74' },
  { level: 4 as const, label: '75–100' },
];

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Target;
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <Card className="bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-700">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs text-graphite-400">{label}</p>
          <p className="text-2xl font-bold text-graphite">{value}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-graphite-400">{hint}</p>
    </Card>
  );
}

export function MasteryMap() {
  const [entries, setEntries] = useState<TopicMasteryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [band, setBand] = useState<MasteryBand | ''>('');
  const [dueOnly, setDueOnly] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiGetTopicMastery(token())
      .then((rows) => {
        if (!active) return;
        setEntries(rows);
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setError('Não foi possível carregar o mapa de domínio. Recarregue a página para tentar novamente.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const rows = entries ?? EMPTY_ENTRIES;
  const subjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const entry of rows) seen.set(entry.subjectId, entry.subject);
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(
    () =>
      filterMastery(rows, {
        subjectId: subjectId || undefined,
        band: band || undefined,
        dueOnly,
        search,
      }),
    [rows, subjectId, band, dueOnly, search],
  );

  const summary = useMemo(() => summarizeMastery(filtered), [filtered]);
  const groups = useMemo(() => groupMasteryBySubject(filtered), [filtered]);
  const filtersActive = hasMasteryFilters({
    subjectId: subjectId || undefined,
    band: band || undefined,
    dueOnly,
    search,
  });
  const attention = summary.byBand.ATENCAO + summary.byBand.CRITICO;

  function clearFilters() {
    setSubjectId('');
    setBand('');
    setDueOnly(false);
    setSearch('');
  }

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm font-semibold">
          <ArrowLeft size={16} />Voltar à visão geral
        </Link>

        <header className="my-8">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700">
            <BrainCircuit size={20} />O que você já sabe
          </span>
          <h1 className="mt-3 text-3xl font-bold">Mapa de domínio</h1>
          <p className="mt-3 max-w-3xl text-graphite-500">
            Cada quadrado é um assunto do seu cronograma. A cor mostra o domínio de 0 a 100, calculado a
            partir das suas tentativas recentes; o estado mostra o que fazer com ele agora. Clique em um
            assunto para praticar questões.
          </p>
        </header>

        {error ? (
          <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p role="status" className="rounded-xl bg-white p-6 text-sm text-graphite-500">
            Carregando seu mapa de domínio…
          </p>
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <Card className="bg-white p-6 sm:p-8">
            <h2 className="text-xl font-bold">Ainda não há domínio registrado</h2>
            <p className="mt-2 max-w-2xl text-sm text-graphite-500">
              O mapa nasce das suas respostas. Responda questões pelo banco, faça um simulado ou siga uma
              tarefa do cronograma; o domínio por assunto é atualizado automaticamente.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/app/questoes">
                <Button>Praticar questões</Button>
              </Link>
              <Link to="/app/simulados">
                <Button variant="outline">Fazer um simulado</Button>
              </Link>
              <Link to="/app/cronograma">
                <Button variant="outline">Abrir cronograma</Button>
              </Link>
            </div>
          </Card>
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <>
            <section aria-label="Resumo do domínio" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                icon={Target}
                label="Assuntos mapeados"
                value={summary.total}
                hint={filtersActive ? `de ${rows.length} no mapa completo` : 'com pelo menos uma tentativa'}
              />
              <Metric
                icon={CheckCircle2}
                label="Dominados"
                value={summary.byBand.DOMINADO}
                hint={`${summary.byBand.EM_PROGRESSO} em progresso`}
              />
              <Metric
                icon={AlertTriangle}
                label="Pedem atenção"
                value={attention}
                hint={`${summary.byBand.CRITICO} em estado crítico`}
              />
              <Metric
                icon={Clock3}
                label="Revisão pendente"
                value={summary.due}
                hint={summary.accuracy === null ? 'sem tentativas no recorte' : `${summary.accuracy}% de acerto no recorte`}
              />
            </section>

            <MasteryEvolutionCard />

            <Card className="mt-6 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold">
                    <Filter className="h-4 w-4 text-primary-700" />Filtrar o mapa
                  </h2>
                  <p className="mt-1 text-xs text-graphite-400">
                    {filtered.length} de {rows.length} assuntos no recorte.
                  </p>
                </div>
                {filtersActive ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    <RotateCcw className="h-3.5 w-3.5" />Limpar filtros
                  </Button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="block">
                  <span className="text-xs font-semibold text-graphite-500">Matéria</span>
                  <select
                    value={subjectId}
                    onChange={(event) => setSubjectId(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-surface-line bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Todas as matérias</option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>{subject.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-graphite-500">Estado</span>
                  <select
                    value={band}
                    onChange={(event) => setBand(event.target.value as MasteryBand | '')}
                    className="mt-1 w-full rounded-xl border border-surface-line bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Todos os estados</option>
                    {MASTERY_BANDS.map((item) => (
                      <option key={item} value={item}>{MASTERY_BAND_LABEL[item]}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-graphite-500">Buscar assunto</span>
                  <span className="relative mt-1 block">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Ex.: funções"
                      className="w-full rounded-xl border border-surface-line bg-white py-2 pl-9 pr-3 text-sm"
                    />
                  </span>
                </label>

                <label className="flex items-end gap-2 pb-2 text-sm text-graphite-600">
                  <input
                    type="checkbox"
                    checked={dueOnly}
                    onChange={(event) => setDueOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-surface-line"
                  />
                  Só revisão pendente
                </label>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-surface-line pt-4 text-[11px] text-graphite-500">
                <span className="font-semibold text-graphite-600">Mapa de calor:</span>
                {HEAT_LEGEND.map((item) => (
                  <span key={item.level} className="inline-flex items-center gap-1.5">
                    <span className={`h-3 w-3 rounded-sm ${MASTERY_HEAT_CLASS[item.level]}`} aria-hidden="true" />
                    {item.label}
                  </span>
                ))}
              </div>
            </Card>

            {filtered.length === 0 ? (
              <Card className="mt-6 bg-white p-6">
                <h2 className="text-lg font-bold">Nenhum assunto neste recorte</h2>
                <p className="mt-2 text-sm text-graphite-500">
                  Tente outra matéria ou estado, ou limpe os filtros para ver o mapa completo.
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                  <RotateCcw className="h-3.5 w-3.5" />Limpar filtros
                </Button>
              </Card>
            ) : (
              <div className="mt-6 space-y-5">
                {groups.map((group) => {
                  const groupBand = dominantMasteryBand(group.summary.byBand);
                  return (
                    <section key={group.subjectId} aria-labelledby={`subject-${group.subjectId}`}>
                      <Card className="bg-white p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h2 id={`subject-${group.subjectId}`} className="text-lg font-bold text-graphite">
                              {group.subject}
                            </h2>
                            <p className="mt-1 text-xs text-graphite-400">
                              {group.summary.total} {group.summary.total === 1 ? 'assunto' : 'assuntos'}
                              {group.summary.averageScore === null ? '' : ` · média ${group.summary.averageScore}/100`}
                              {group.summary.due > 0 ? ` · ${group.summary.due} com revisão pendente` : ''}
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${MASTERY_BAND_CLASS[groupBand]}`}
                            title={MASTERY_BAND_HINT[groupBand]}
                          >
                            {MASTERY_BAND_LABEL[groupBand]}
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {group.topics.map((entry) => {
                            const accuracy = masteryAccuracy(entry);
                            const entryBand = masteryBand(entry.status);
                            return (
                              <Link
                                key={entry.id}
                                to={`/app/questoes?subjectId=${encodeURIComponent(entry.subjectId)}&topicId=${encodeURIComponent(entry.topicId)}`}
                                className={`group flex min-h-[128px] flex-col justify-between rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-md ${heatClass(entry.masteryScore)}`}
                                title={`${entry.subject} · ${entry.topic}: ${MASTERY_STATUS_LABEL[entry.status]} (${entry.masteryScore}/100). ${masteryReviewLabel(entry)}`}
                                aria-label={`${entry.topic}: ${MASTERY_STATUS_LABEL[entry.status]}, domínio ${entry.masteryScore} de 100, ${accuracy === null ? 'sem tentativas' : `${accuracy}% de acerto`}. ${masteryReviewLabel(entry)}. Abrir questões do assunto.`}
                              >
                                <div>
                                  <p className="text-sm font-semibold leading-snug">{entry.topic}</p>
                                  <p className="mt-1 text-[11px] font-bold uppercase tracking-wide opacity-70">
                                    {MASTERY_BAND_LABEL[entryBand]}
                                  </p>
                                </div>

                                <div className="mt-3">
                                  <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                                    <span>{entry.masteryScore}/100</span>
                                    <span>{accuracy === null ? 'sem tentativas' : `${accuracy}% de acerto`}</span>
                                  </div>
                                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/70" aria-hidden="true">
                                    <div
                                      className="h-full rounded-full bg-current opacity-50"
                                      style={{ width: `${Math.max(0, Math.min(100, entry.masteryScore))}%` }}
                                    />
                                  </div>
                                  <p className="mt-1.5 line-clamp-1 text-[11px] opacity-75">{masteryReviewLabel(entry)}</p>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </Card>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
