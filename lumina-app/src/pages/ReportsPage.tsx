import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, FileDown, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  ApiError,
  apiClassReport,
  apiInstitutionReport,
  apiListSubjects,
  apiReportScope,
  apiReportSnapshot,
  apiReportSnapshots,
  apiSaveReport,
  apiStudentReport,
  apiSubjectReport,
  type Subject,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import {
  TYPE_LABEL,
  download,
  minutes,
  percent,
  reportCsv,
  reportFileName,
  type AnyReport,
  type ClassReport,
  type InstitutionReport,
  type ReportScope,
  type ReportType,
  type SnapshotSummary,
  type StudentReport,
  type SubjectReport,
} from '@/lib/reports';

const token = () => getAccessToken() ?? '';
const field = 'mt-1 w-full rounded-xl border border-surface-line bg-white px-3 py-2.5 text-sm';
const PERIODS = [
  { id: '7', label: 'Últimos 7 dias' },
  { id: '30', label: 'Últimos 30 dias' },
  { id: '90', label: 'Últimos 90 dias' },
  { id: 'month', label: 'Mês passado' },
];
const periodOf = (id: string) => (id === 'month' ? { month: true } : { days: Number(id) });

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-surface-line bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint ? <p className="text-xs text-graphite-500">{hint}</p> : null}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-surface-line bg-white">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-graphite-400"><tr>{head.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-surface-line">{r.map((c, k) => <td key={k} className="px-3 py-2">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mt-6 break-inside-avoid"><h3 className="text-lg font-bold">{title}</h3>{children}</section>;
}

function StudentView({ r }: { r: StudentReport }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Questões avulsas" value={String(r.questions.answered)} hint={`${percent(r.questions.accuracy)} de acerto`} />
        <Metric label="Simulados" value={String(r.simulations.count)} hint={`${percent(r.simulations.accuracy)} de acerto em ${r.simulations.answers} respostas`} />
        <Metric label="Tempo de estudo" value={minutes(r.studyMinutes)} />
        <Metric label="Redações corrigidas" value={String(r.essays.count)} hint={r.essays.average === null ? 'sem nota no período' : `média ${r.essays.average}`} />
      </div>
      {r.questions.strong.length || r.questions.weak.length ? (
        <p className="mt-4 text-sm">
          {r.questions.strong.length ? <>Matérias fortes: <strong>{r.questions.strong.join(', ')}</strong>. </> : null}
          {r.questions.weak.length ? <>Matérias que pedem atenção: <strong>{r.questions.weak.join(', ')}</strong>.</> : null}
        </p>
      ) : null}
      <Section title="Acerto por matéria">
        {r.questions.bySubject.length ? <Table head={['Matéria', 'Respondidas', 'Acerto']} rows={r.questions.bySubject.map((s) => [s.subject, s.answered, percent(s.accuracy)])} /> : <p className="text-sm text-graphite-500">Nenhuma questão avulsa no período.</p>}
      </Section>
      <Section title="Assuntos (domínio de 0 a 100)">
        {r.mastery.weakest.length || r.mastery.strongest.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div><p className="text-sm font-semibold">Pedem atenção (abaixo de 70)</p>{r.mastery.weakest.length ? <Table head={['Assunto', 'Matéria', 'Domínio']} rows={r.mastery.weakest.map((m) => [m.topic, m.subject, m.masteryScore])} /> : <p className="text-sm text-graphite-500">Nenhum.</p>}</div>
            <div><p className="text-sm font-semibold">Dominados (70 ou mais)</p>{r.mastery.strongest.length ? <Table head={['Assunto', 'Matéria', 'Domínio']} rows={r.mastery.strongest.map((m) => [m.topic, m.subject, m.masteryScore])} /> : <p className="text-sm text-graphite-500">Nenhum ainda.</p>}</div>
          </div>
        ) : <p className="text-sm text-graphite-500">Ainda sem domínio registrado.</p>}
      </Section>
      {r.skills.weakest.length ? (
        <Section title="Habilidades do ENEM com menor acerto">
          <Table head={['Habilidade', 'Respostas', 'Acerto']} rows={r.skills.weakest.map((s) => [<span key={s.code} title={s.text}>{s.code.replace('-', ' ')} — {s.text.slice(0, 80)}{s.text.length > 80 ? '…' : ''}</span>, s.attempts, percent(s.accuracy)])} />
        </Section>
      ) : null}
      {r.essays.latest.length ? <Section title="Últimas redações"><Table head={['Redação', 'Nota', 'Data']} rows={r.essays.latest.map((e) => [e.title || '—', e.score, new Date(e.date).toLocaleDateString('pt-BR')])} /></Section> : null}
      {r.recoveryPlans.length ? <Section title="Planos de recuperação"><Table head={['Assunto', 'Situação', 'Domínio antes → depois']} rows={r.recoveryPlans.map((p) => [p.topic, p.status === 'COMPLETED' ? 'Concluído' : p.status === 'ACTIVE' ? 'Em andamento' : 'Cancelado', `${p.baselineMastery ?? '—'} → ${p.finalMastery ?? '—'}`])} /></Section> : null}
    </>
  );
}

function ClassView({ r }: { r: ClassReport }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Alunos" value={String(r.summary.studentCount)} hint={`${r.summary.activeStudentCount} ativos (${r.summary.participationRate}%)`} />
        <Metric label="Acerto" value={percent(r.summary.accuracy)} hint={`${r.summary.answerCount} respostas em simulados e atividades`} />
        <Metric label="Tempo de estudo" value={minutes(r.summary.studyMinutes)} />
        <Metric label="Em atenção" value={String(r.summary.studentsAtRisk)} hint={`${r.openAlerts} alertas abertos · ${r.recoveryPlans.active} planos ativos`} />
      </div>
      <Section title="Alunos">
        <Table head={['Aluno', 'Respostas', 'Acerto', 'Estudo', 'Risco']} rows={(r.class?.students ?? []).map((s) => [s.name, s.answerCount, percent(s.accuracy), minutes(s.studyMinutes), s.riskLevel === 'NONE' ? '—' : s.riskLevel === 'HIGH' ? 'Alto' : s.riskLevel === 'MEDIUM' ? 'Médio' : 'Baixo'])} />
      </Section>
      {r.subjects.length ? <Section title="Por matéria"><Table head={['Matéria', 'Respostas', 'Acerto']} rows={r.subjects.map((s) => [s.subject, s.attempts, percent(s.accuracy)])} /></Section> : null}
      {r.difficultQuestions.length ? <Section title="Questões mais difíceis"><Table head={['Questão', 'Matéria', 'Respostas', 'Acerto']} rows={r.difficultQuestions.map((q) => [q.stem, q.subject, q.attempts, percent(q.accuracy)])} /></Section> : null}
      {r.signals.length ? (
        <Section title="Sinais pedagógicos">
          <ul className="mt-2 space-y-2 text-sm">{r.signals.map((s) => <li key={s.id} className="rounded-xl border border-surface-line bg-white p-3"><strong>{s.title}.</strong> {s.recommendation}</li>)}</ul>
        </Section>
      ) : null}
    </>
  );
}

function SubjectView({ r }: { r: SubjectReport }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2"><Metric label="Respostas" value={String(r.attempts)} /><Metric label="Acerto geral" value={percent(r.accuracy)} /></div>
      <Section title="Por turma"><Table head={['Turma', 'Respostas', 'Acerto']} rows={r.classes.map((c) => [c.className, c.attempts, percent(c.accuracy)])} /></Section>
      {r.hardestQuestions.length ? <Section title="Questões com menor acerto"><Table head={['Questão', 'Respostas', 'Acerto']} rows={r.hardestQuestions.map((q) => [q.stem, q.attempts, percent(q.accuracy)])} /></Section> : null}
      {r.truncated ? <p className="mt-3 text-xs text-graphite-500">Mostrando as 30 primeiras turmas.</p> : null}
    </>
  );
}

function InstitutionView({ r }: { r: InstitutionReport }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Turmas" value={String(r.summary.classCount)} hint={`${r.summary.studentCount} alunos`} />
        <Metric label="Participação" value={`${r.summary.participationRate}%`} hint={`${r.summary.activeStudentCount} alunos ativos`} />
        <Metric label="Acerto" value={percent(r.summary.accuracy)} />
        <Metric label="Em atenção" value={String(r.summary.studentsAtRisk)} hint={`${r.signalsBySeverity.HIGH ?? 0} sinais de gravidade alta · ${r.recoveryPlans.active} planos ativos`} />
      </div>
      <Section title="Turmas"><Table head={['Turma', 'Alunos', 'Participação', 'Acerto', 'Estudo', 'Em atenção']} rows={r.classes.map((c) => [c.name, c.studentCount, `${c.participationRate}%`, percent(c.accuracy), minutes(c.studyMinutes), c.studentsAtRisk])} /></Section>
      {r.subjects.length ? <Section title="Por matéria"><Table head={['Matéria', 'Respostas', 'Acerto']} rows={r.subjects.map((s) => [s.subject, s.attempts, percent(s.accuracy)])} /></Section> : null}
    </>
  );
}

function ReportView({ report }: { report: AnyReport }) {
  return (
    <article className="mt-6">
      <header className="mb-4">
        <p className="text-sm font-semibold text-primary-700">Relatório {TYPE_LABEL[report.type].toLowerCase()} · {report.period.name}</p>
        <h2 className="text-2xl font-bold">{report.title}</h2>
        <p className="text-xs text-graphite-500">
          De {new Date(report.period.from).toLocaleDateString('pt-BR')} a {new Date(new Date(report.period.to).getTime() - 1).toLocaleDateString('pt-BR')}. Percentual de acerto, não nota do ENEM (a nota TRI depende dos parâmetros de cada item).
        </p>
      </header>
      {report.type === 'STUDENT' ? <StudentView r={report} /> : report.type === 'CLASS' ? <ClassView r={report} /> : report.type === 'SUBJECT' ? <SubjectView r={report} /> : <InstitutionView r={report} />}
    </article>
  );
}

/** /app/relatorios — relatórios individual, de turma, de matéria e institucional (item 59). */
export function ReportsPage() {
  const [scope, setScope] = useState<ReportScope | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [type, setType] = useState<ReportType>('STUDENT');
  const [period, setPeriod] = useState('30');
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('me');
  const [subject, setSubject] = useState('');
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [report, setReport] = useState<AnyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState<SnapshotSummary[] | null>(null);

  const classes = scope ? [...new Map([...scope.teacherClasses, ...scope.institutionClasses].map((c) => [c.id, c])).values()] : [];
  const types: ReportType[] = ['STUDENT', ...(classes.length ? (['CLASS', 'SUBJECT'] as const) : []), ...(scope?.institution ? (['INSTITUTION'] as const) : [])];

  useEffect(() => {
    apiReportScope(token()).then((s) => {
      setScope(s);
      const first = [...s.teacherClasses, ...s.institutionClasses][0];
      if (first) {
        setClassId(first.id);
        setType(s.institution ? 'INSTITUTION' : 'CLASS');
      }
    }).catch(() => setError('Não foi possível carregar os relatórios.'));
    apiListSubjects(token()).then((list) => { setSubjects(list); setSubject(list[0]?.name ?? ''); }).catch(() => undefined);
    apiReportSnapshots(token()).then(setSaved).catch(() => setSaved([]));
  }, []);

  // Alunos da turma escolhida, para o relatório individual de professor e escola.
  useEffect(() => {
    if (!classId) return;
    apiClassReport(token(), classId, { days: 7 }).then((r) => setStudents((r.class?.students ?? []).map((s) => ({ id: s.id, name: s.name })))).catch(() => setStudents([]));
  }, [classId]);

  async function generate() {
    setLoading(true);
    setError('');
    setMessage('');
    setReport(null);
    const p = periodOf(period);
    try {
      if (type === 'STUDENT') setReport(await apiStudentReport(token(), studentId, p));
      else if (type === 'CLASS') setReport(await apiClassReport(token(), classId, p));
      else if (type === 'SUBJECT') setReport(await apiSubjectReport(token(), subject, p, classId || undefined));
      else setReport(await apiInstitutionReport(token(), p));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível gerar o relatório.');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!report) return;
    const scopeId = type === 'STUDENT' ? studentId : type === 'CLASS' ? classId : type === 'SUBJECT' ? classId || 'all' : scope!.institution!.workspaceId;
    try {
      await apiSaveReport(token(), { type, scopeId, subject: type === 'SUBJECT' ? subject : undefined, ...periodOf(period) });
      setMessage('Relatório salvo. Ele fica na lista "Relatórios salvos".');
      setSaved(await apiReportSnapshots(token()));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
    }
  }

  async function openSaved(id: string) {
    try {
      const snap = await apiReportSnapshot(token(), id);
      setReport(snap.data);
      setMessage(`Relatório salvo em ${new Date(snap.createdAt).toLocaleString('pt-BR')}${snap.automatic ? ' (gerado automaticamente no fim do mês)' : ''}.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Não foi possível abrir o relatório salvo.');
    }
  }

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-6xl">
        <div className="print:hidden">
          <Link to="/app" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Voltar à visão geral</Link>
          <header className="my-8">
            <h1 className="text-3xl font-bold">Relatórios</h1>
            <p className="mt-3 max-w-3xl text-graphite-500">
              Escolha o tipo e o período, gere o relatório e exporte em PDF (pela impressão do navegador) ou em planilha. Os relatórios mensais das suas turmas são salvos automaticamente no início de cada mês.
            </p>
          </header>

          <Card className="bg-white p-5">
            <div className="grid gap-3 md:grid-cols-4">
              <label className="text-sm">Tipo
                <select className={field} value={type} onChange={(e) => { setType(e.target.value as ReportType); setReport(null); }}>
                  {types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </label>
              <label className="text-sm">Período
                <select className={field} value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
              </label>
              {type !== 'INSTITUTION' && classes.length ? (
                <label className="text-sm">Turma
                  <select className={field} value={classId} onChange={(e) => { setClassId(e.target.value); setStudentId('me'); }}>
                    {type === 'SUBJECT' ? <option value="">Todas as minhas turmas</option> : null}
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              ) : null}
              {type === 'STUDENT' && classes.length ? (
                <label className="text-sm">Aluno
                  <select className={field} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                    <option value="me">Eu</option>
                    {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              ) : null}
              {type === 'SUBJECT' ? (
                <label className="text-sm">Matéria
                  <select className={field} value={subject} onChange={(e) => setSubject(e.target.value)}>{subjects.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</select>
                </label>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void generate()} disabled={loading || !scope || (type === 'SUBJECT' && !subject)}>{loading ? 'Gerando…' : 'Gerar relatório'}</Button>
              {report ? (
                <>
                  <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Exportar PDF</Button>
                  <Button variant="outline" onClick={() => download(reportFileName(report, 'csv'), reportCsv(report), 'text/csv;charset=utf-8')}><Download className="h-4 w-4" />Planilha (CSV)</Button>
                  <Button variant="outline" onClick={() => download(reportFileName(report, 'json'), JSON.stringify(report, null, 2), 'application/json')}><FileDown className="h-4 w-4" />Dados (JSON)</Button>
                  <Button variant="ghost" onClick={() => void save()}><Save className="h-4 w-4" />Salvar relatório</Button>
                </>
              ) : null}
            </div>
            {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
            {message ? <p role="status" className="mt-3 text-sm text-graphite-500">{message}</p> : null}
          </Card>
        </div>

        {report ? <ReportView report={report} /> : null}

        <section className="mt-10 print:hidden">
          <h2 className="text-lg font-bold">Relatórios salvos</h2>
          {saved && saved.length === 0 ? <p className="mt-2 text-sm text-graphite-500">Nenhum relatório salvo ainda.</p> : null}
          {saved && saved.length ? (
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {saved.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => void openSaved(s.id)} className="w-full rounded-xl border border-surface-line bg-white p-3 text-left text-sm hover:border-primary">
                    <p className="font-semibold">{TYPE_LABEL[s.type]} · {s.title}</p>
                    <p className="text-xs text-graphite-500">{s.periodName}{s.automatic ? ' · mensal automático' : ''} · salvo em {new Date(s.createdAt).toLocaleDateString('pt-BR')}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </main>
  );
}
