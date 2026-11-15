import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  Clock3,
  Download,
  GraduationCap,
  Loader2,
  RefreshCw,
  Target,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PedagogicalAlerts } from '@/components/PedagogicalAlerts';
import { TeacherRecoveryPlans } from '@/components/TeacherRecoveryPlans';
import { useAuth } from '@/contexts/AuthContext';
import {
  apiSimulationClasses,
  apiTeacherAnalytics,
  ApiError,
  type SimulationClass,
  type TeacherAnalyticsResult,
  type TeacherAnalyticsSignal,
  type TeacherAnalyticsStudent,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import {
  classesSeveridade,
  filtrarQuestoesDificeis,
  filtrarSinaisCriticos,
  formatarDataHora,
  formatarMinutos,
  formatarPercentual,
  gerarCsvAlunos,
  ordenarSinais,
  resumoParticipacao,
  rotuloRisco,
  rotuloSeveridade,
  rotuloSinal,
} from '@/lib/teacher-analytics';

const PERIODOS = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 60, label: '60 dias' },
  { value: 90, label: '90 dias' },
];

function corRisco(level: TeacherAnalyticsStudent['riskLevel']): string {
  if (level === 'HIGH') return 'bg-red-50 text-red-700 border-red-200';
  if (level === 'MEDIUM') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (level === 'LOW') return 'bg-sky-50 text-sky-700 border-sky-200';
  return 'bg-surface-card text-graphite-400 border-surface-line';
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="bg-white p-5">
      <div className="flex items-center gap-2 text-graphite-400">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-graphite">{value}</p>
      <p className="mt-1 text-xs text-graphite-400">{detail}</p>
    </Card>
  );
}

function SignalCard({ signal }: { signal: TeacherAnalyticsSignal }) {
  return (
    <article className="rounded-xl border border-surface-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${classesSeveridade(signal.severity)}`}>
          {rotuloSeveridade(signal.severity)}
        </span>
        <span className="rounded-full bg-graphite/5 px-2.5 py-1 text-xs font-semibold text-graphite-500">
          {rotuloSinal(signal.kind)}
        </span>
        {signal.className && (
          <span className="text-xs font-medium text-graphite-400">{signal.className}</span>
        )}
      </div>
      <h3 className="mt-3 font-semibold text-graphite">{signal.title}</h3>
      <p className="mt-1 text-sm text-graphite-500">{signal.detail}</p>
      <p className="mt-3 rounded-lg bg-surface-card p-3 text-sm text-graphite-500">
        <strong className="text-graphite">Sugestão:</strong> {signal.recommendation}
      </p>
    </article>
  );
}

function StudentRow({ student }: { student: TeacherAnalyticsStudent }) {
  return (
    <tr className="border-b border-surface-line last:border-0">
      <td className="px-3 py-3">
        <p className="font-semibold text-graphite">{student.name}</p>
        <p className="text-xs text-graphite-400">{student.email}</p>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{student.answerCount}</td>
      <td className="px-3 py-3 text-right tabular-nums">{formatarPercentual(student.accuracy)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{formatarMinutos(student.studyMinutes)}</td>
      <td className="px-3 py-3">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${corRisco(student.riskLevel)}`}>
          {rotuloRisco(student.riskLevel)}
        </span>
        {student.riskReasons.length > 0 && (
          <p className="mt-1 text-xs text-graphite-400">
            {student.riskReasons.map((reason) => reason.label).join(' • ')}
          </p>
        )}
      </td>
      <td className="px-3 py-3 text-right text-xs text-graphite-400">
        {formatarDataHora(student.lastActivityAt)}
      </td>
    </tr>
  );
}

export function TeacherAnalyticsPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState<SimulationClass[]>([]);
  const [data, setData] = useState<TeacherAnalyticsResult | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<{ days: number; classId: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestSeq = useRef(0);

  const token = getAccessToken();
  const isTeacher = user?.accountType === 'TEACHER';
  const filtrosAtuais =
    appliedFilters?.days === days && appliedFilters?.classId === classId;

  const carregar = useCallback(async () => {
    if (!token || !isTeacher) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError('');
    try {
      const result = await apiTeacherAnalytics(token, {
        days,
        classId: classId || undefined,
      });
      if (seq !== requestSeq.current) return;
      setData(result);
      setAppliedFilters({ days, classId });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar o acompanhamento pedagógico.',
      );
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [classId, days, isTeacher, token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!token || !isTeacher) return;
    let active = true;
    apiSimulationClasses(token)
      .then((rows) => {
        if (active) setClasses(rows.filter((row) => row.isTeacher));
      })
      .catch(() => {
        // O filtro por turma é opcional; a análise consolidada continua útil.
      });
    return () => {
      active = false;
    };
  }, [isTeacher, token]);

  const sinais = useMemo(() => (data ? ordenarSinais(data.signals) : []), [data]);
  const sinaisCriticos = useMemo(() => filtrarSinaisCriticos(sinais), [sinais]);
  const questoesDificeis = useMemo(
    () => (data ? filtrarQuestoesDificeis(data.questions) : []),
    [data],
  );
  const evolucao = useMemo(() => (data ? data.evolution.slice(-14) : []), [data]);
  const maxEstudo = useMemo(
    () => Math.max(1, ...evolucao.map((point) => point.studyMinutes)),
    [evolucao],
  );

  function exportarCsv() {
    if (!data || !filtrosAtuais) return;
    const blob = new Blob(['\ufeff', gerarCsvAlunos(data)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `acompanhamento-${data.period.days}d-${data.period.to.slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite">
      <div className="mx-auto max-w-7xl">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-500 hover:text-graphite">
          <ArrowLeft className="h-4 w-4" /> Visão geral
        </Link>

        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Fase 3 • Acompanhamento</p>
            <h1 className="mt-1 text-3xl font-bold">Painel analítico do professor</h1>
            <p className="mt-2 max-w-3xl text-sm text-graphite-500">
              Participação, desempenho por questão, tempo de estudo e sinais pedagógicos das suas turmas.
              Os indicadores usam apenas dados das turmas em que você está vinculado.
            </p>
          </div>
          {isTeacher && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold text-graphite-500">
                Período
                <select
                  className="mt-1 block rounded-lg border border-surface-line bg-white px-3 py-2 text-sm font-normal text-graphite"
                  value={days}
                  onChange={(event) => setDays(Number(event.target.value))}
                >
                  {PERIODOS.map((period) => (
                    <option key={period.value} value={period.value}>{period.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-graphite-500">
                Turma
                <select
                  className="mt-1 block min-w-44 rounded-lg border border-surface-line bg-white px-3 py-2 text-sm font-normal text-graphite"
                  value={classId}
                  onChange={(event) => setClassId(event.target.value)}
                >
                  <option value="">Todas as minhas turmas</option>
                  {classes.map((classRoom) => (
                    <option key={classRoom.id} value={classRoom.id}>{classRoom.name}</option>
                  ))}
                </select>
              </label>
              <Button type="button" variant="outline" onClick={() => void carregar()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={exportarCsv}
                disabled={!data || loading || !filtrosAtuais}
              >
                <Download className="mr-2 h-4 w-4" />
                Exportar alunos
              </Button>
            </div>
          )}
        </div>

        {!isTeacher && (
          <Card className="mt-6 bg-white">
            <h2 className="font-semibold">Painel exclusivo para professores</h2>
            <p className="mt-2 text-sm text-graphite-500">
              A visão consolidada por turma usa o vínculo de professor. Coordenação e direção continuam com os painéis institucionais atuais.
            </p>
          </Card>
        )}

        {error && (
          <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        )}

        {data && appliedFilters && !filtrosAtuais && (
          <p role="status" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Exibindo os dados de {appliedFilters.days} dias
            {appliedFilters.classId ? ' para a turma selecionada anteriormente' : ' de todas as turmas'}.
            Atualize para aplicar o novo filtro; a exportação fica bloqueada até a atualização.
          </p>
        )}

        {loading && !data && (
          <div className="mt-10 flex items-center gap-3 text-graphite-500" role="status">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando indicadores…
          </div>
        )}

        {data && (
          <>
            <section aria-label="Resumo do período" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <SummaryCard
                icon={<GraduationCap className="h-4 w-4" />}
                label="Turmas"
                value={String(data.summary.classCount)}
                detail={data.period.days === 1 ? '1 dia analisado' : `${data.period.days} dias analisados`}
              />
              <SummaryCard
                icon={<Users className="h-4 w-4" />}
                label="Alunos"
                value={String(data.summary.studentCount)}
                detail={`${data.summary.activeStudentCount} ativos no período`}
              />
              <SummaryCard
                icon={<Activity className="h-4 w-4" />}
                label="Participação"
                value={formatarPercentual(data.summary.participationRate)}
                detail={`${data.summary.submissionCount} entregas`}
              />
              <SummaryCard
                icon={<Target className="h-4 w-4" />}
                label="Média de acerto"
                value={formatarPercentual(data.summary.accuracy)}
                detail={`${data.summary.answerCount} respostas`}
              />
              <SummaryCard
                icon={<Clock3 className="h-4 w-4" />}
                label="Tempo de estudo"
                value={formatarMinutos(data.summary.studyMinutes)}
                detail="Somado por aluno, sem duplicar"
              />
              <SummaryCard
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Em atenção"
                value={String(data.summary.studentsAtRisk)}
                detail={`${sinaisCriticos.length} sinais críticos`}
              />
            </section>

            <PedagogicalAlerts />
            <TeacherRecoveryPlans />

            <section className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">Sinais do período filtrado</h2>
                  <p className="text-sm text-graphite-500">
                    Calculados na hora para o período e a turma escolhidos acima. O acompanhamento fica nos alertas.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-graphite-500">
                  {sinais.length} sinal(is)
                </span>
              </div>
              {sinais.length === 0 ? (
                <Card className="mt-4 bg-white">
                  <p className="text-sm text-graphite-500">
                    Nenhum sinal crítico nos filtros atuais. Continue acompanhando a participação e as próximas entregas.
                  </p>
                </Card>
              ) : (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {sinais.map((signal) => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>
              )}
            </section>

            <section className="mt-8 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">Evolução recente</h2>
                    <p className="text-sm text-graphite-500">Acerto e tempo de estudo por dia de calendário.</p>
                  </div>
                  <BarChart3 className="h-5 w-5 text-graphite-400" />
                </div>
                {evolucao.length === 0 ? (
                  <p className="mt-4 text-sm text-graphite-500">Ainda não há atividade registrada no período.</p>
                ) : (
                  <div className="mt-5 space-y-3">
                    {evolucao.map((point) => (
                      <div key={point.day} className="grid gap-2 sm:grid-cols-[6rem_1fr_8rem] sm:items-center">
                        <span className="text-xs font-semibold text-graphite-500">
                          {new Date(`${point.day}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                        <div className="h-3 overflow-hidden rounded-full bg-surface-card">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${point.accuracy ?? 0}%` }}
                            title={`${point.accuracy ?? 0}% de acerto`}
                          />
                        </div>
                        <span className="text-xs text-graphite-400">
                          {formatarPercentual(point.accuracy)} • {formatarMinutos(point.studyMinutes)}
                          <span className="ml-1 text-graphite-400">({point.submissions} entrega(s))</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">Tempo de estudo</h2>
                    <p className="text-sm text-graphite-500">Distribuição dos minutos registrados.</p>
                  </div>
                  <Clock3 className="h-5 w-5 text-graphite-400" />
                </div>
                {evolucao.length === 0 ? (
                  <p className="mt-4 text-sm text-graphite-500">Sem registros de tempo no período.</p>
                ) : (
                  <div className="mt-6 flex h-36 items-end gap-2">
                    {evolucao.map((point) => (
                      <div key={point.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                        <div
                          className="w-full rounded-t bg-primary/70"
                          style={{ height: `${Math.max(4, (point.studyMinutes / maxEstudo) * 100)}%` }}
                          title={`${point.day}: ${formatarMinutos(point.studyMinutes)}`}
                        />
                        <span className="text-[10px] text-graphite-400">
                          {new Date(`${point.day}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>

            <section className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">Questões mais difíceis</h2>
                  <p className="text-sm text-graphite-500">
                    Itens com pelo menos 3 respostas e acerto abaixo de 60% no período.
                  </p>
                </div>
                <BookOpenCheck className="h-5 w-5 text-graphite-400" />
              </div>
              {questoesDificeis.length === 0 ? (
                <Card className="mt-4 bg-white">
                  <p className="text-sm text-graphite-500">Nenhuma questão atingiu o critério de dificuldade.</p>
                </Card>
              ) : (
                <Card className="mt-4 overflow-x-auto bg-white p-0">
                  <table className="w-full min-w-[780px] text-sm">
                    <thead className="border-b border-surface-line bg-surface-card text-left text-xs uppercase tracking-wide text-graphite-400">
                      <tr>
                        <th className="px-4 py-3">Questão</th>
                        <th className="px-4 py-3">Disciplina</th>
                        <th className="px-4 py-3 text-right">Respostas</th>
                        <th className="px-4 py-3 text-right">Brancos</th>
                        <th className="px-4 py-3 text-right">Acerto</th>
                        <th className="px-4 py-3 text-right">Atividades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questoesDificeis.map((question) => (
                        <tr key={question.key} className="border-b border-surface-line last:border-0">
                          <td className="max-w-xl px-4 py-3">
                            <p className="line-clamp-2 text-graphite">{question.stem}</p>
                          </td>
                          <td className="px-4 py-3 text-graphite-500">{question.subject}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{question.attempts}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{question.blankCount}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatarPercentual(question.accuracy)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{question.simulationCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </section>

            <section className="mt-8">
              <h2 className="text-xl font-bold">Turmas e alunos</h2>
              <p className="text-sm text-graphite-500">
                {resumoParticipacao(data.summary.activeStudentCount, data.summary.studentCount)} no período selecionado.
              </p>
              {data.classes.length === 0 && (
                <Card className="mt-4 bg-white">
                  <p className="text-sm text-graphite-500">
                    Nenhuma turma ativa vinculada ao seu perfil. Crie ou entre em uma turma para
                    começar o acompanhamento.
                  </p>
                </Card>
              )}
              <div className="mt-4 space-y-5">
                {data.classes.map((classRoom) => (
                  <Card key={classRoom.id} className="bg-white">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold">{classRoom.name}</h3>
                        <p className="text-sm text-graphite-500">
                          {classRoom.studentCount} aluno(s) • {classRoom.activeStudentCount} ativo(s) •{' '}
                          {formatarPercentual(classRoom.participationRate)} de participação
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-surface-card px-3 py-1 text-graphite-500">
                          {formatarPercentual(classRoom.accuracy)} de acerto
                        </span>
                        <span className="rounded-full bg-surface-card px-3 py-1 text-graphite-500">
                          {formatarMinutos(classRoom.studyMinutes)} de estudo
                        </span>
                        <span className="rounded-full bg-surface-card px-3 py-1 text-graphite-500">
                          {classRoom.studentsAtRisk} em atenção
                        </span>
                      </div>
                    </div>

                    {classRoom.students.length === 0 ? (
                      <p className="mt-4 text-sm text-graphite-500">Nenhum aluno vinculado a esta turma.</p>
                    ) : (
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[860px] text-sm">
                          <thead className="border-b border-surface-line text-left text-xs uppercase tracking-wide text-graphite-400">
                            <tr>
                              <th className="px-3 py-2">Aluno</th>
                              <th className="px-3 py-2 text-right">Respostas</th>
                              <th className="px-3 py-2 text-right">Acerto</th>
                              <th className="px-3 py-2 text-right">Estudo</th>
                              <th className="px-3 py-2">Sinal</th>
                              <th className="px-3 py-2 text-right">Última atividade</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...classRoom.students]
                              .sort((a, b) => {
                                const order = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };
                                return order[a.riskLevel] - order[b.riskLevel] || a.name.localeCompare(b.name);
                              })
                              .map((student) => (
                                <StudentRow key={student.id} student={student} />
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {classRoom.difficultQuestions.length > 0 && (
                      <div className="mt-4 rounded-xl bg-surface-card p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">
                          Conteúdos críticos desta turma
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {classRoom.difficultQuestions.map((question) => (
                            <span key={question.key} className="rounded-full bg-white px-3 py-1 text-xs text-graphite-500">
                              {question.subject}: {formatarPercentual(question.accuracy)} em {question.attempts} respostas
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
