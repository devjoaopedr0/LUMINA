import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { ApiError, apiCompareClasses, apiCompareMe, apiReportScopeLite } from '@/lib/api';
import {
  formatChange,
  pct,
  trendTone,
  versusText,
  type ClassComparison,
  type Delta,
  type ReportScope,
  type StudentComparison,
} from '@/lib/institution';

const TONE = { good: 'text-emerald-700', bad: 'text-red-700', neutral: 'text-graphite-500' } as const;
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function Change({ d, unit, lowerIsBetter = false }: { d: Delta; unit: 'pp' | 'min' | 'count' | 'points'; lowerIsBetter?: boolean }) {
  return <span className={`text-xs font-semibold ${TONE[trendTone(d.trend, lowerIsBetter)]}`}>{formatChange(d.change, unit)}</span>;
}

/** Comparação de desempenho (Fase 3, item 43). Só agregados: nunca a nota de um colega. */
export function ComparePage() {
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState<ReportScope | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [classes, setClasses] = useState<ClassComparison | null>(null);
  const [me, setMe] = useState<StudentComparison | null>(null);
  const [error, setError] = useState('');
  const token = () => getAccessToken() ?? '';

  useEffect(() => {
    apiReportScopeLite(token())
      .then((s) => {
        setScope(s);
        const all = [...new Map([...s.teacherClasses, ...s.institutionClasses].map((c) => [c.id, c])).values()];
        setSelected(all.slice(0, 3).map((c) => c.id));
      })
      .catch(() => setScope({ teacherClasses: [], institution: null, institutionClasses: [] }));
  }, []);

  const allClasses = scope ? [...new Map([...scope.teacherClasses, ...scope.institutionClasses].map((c) => [c.id, c])).values()] : [];
  const isStaff = allClasses.length > 0;

  useEffect(() => {
    if (!scope) return;
    setError('');
    if (isStaff && selected.length) {
      apiCompareClasses(token(), selected, days).then(setClasses).catch((e) => setError(errorText(e, 'Não foi possível comparar as turmas.')));
    }
    if (!isStaff) {
      apiCompareMe(token(), days).then(setMe).catch((e) => setError(errorText(e, 'Não foi possível carregar sua comparação.')));
    }
  }, [scope, isStaff, selected, days]);

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 6 ? cur : [...cur, id]));
  }

  return (
    <main className="min-h-screen bg-surface-card px-4 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link to="/app" className="inline-flex items-center gap-1 text-sm font-semibold"><ArrowLeft size={15} />Visão geral</Link>
        <h1 className="mt-6 flex items-center gap-2 text-3xl font-bold"><TrendingUp size={26} />Comparar desempenho</h1>
        <p className="mt-1 text-sm text-graphite-500">
          {isStaff ? 'Turmas lado a lado e cada uma com o período anterior.' : 'Você comparado com você mesmo e com a média das suas turmas.'} Nunca aparece a nota de um colega.
        </p>

        <label className="mt-4 inline-flex items-center gap-2 text-sm">Período
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border bg-white p-1.5">
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
        </label>

        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!scope && <p role="status" className="mt-6">Carregando…</p>}

        {isStaff && (
          <>
            <fieldset className="mt-4 flex flex-wrap gap-2">
              <legend className="mb-2 text-sm font-semibold">Turmas (até 6)</legend>
              {allClasses.map((c) => (
                <button key={c.id} type="button" aria-pressed={selected.includes(c.id)} onClick={() => toggle(c.id)} className={`rounded-full border px-3 py-1.5 text-sm ${selected.includes(c.id) ? 'bg-graphite text-white' : 'bg-white'}`}>{c.name}</button>
              ))}
            </fieldset>
            {classes && (
              <>
                <div className="mt-5 overflow-x-auto rounded-2xl border bg-white">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-surface-card text-left text-xs text-graphite-500">
                      <tr><th className="p-3">Turma</th><th className="p-3">Acerto</th><th className="p-3">Participação</th><th className="p-3">Estudo por aluno ativo</th><th className="p-3">Entregas</th><th className="p-3">Em risco</th></tr>
                    </thead>
                    <tbody>
                      {classes.classes.map((c) => (
                        <tr key={c.id} className="border-t">
                          <td className="p-3 font-semibold">{c.name}<span className="block text-xs font-normal text-graphite-500">{c.activeStudentCount}/{c.studentCount} ativos</span></td>
                          <td className="p-3">{pct(c.accuracy.current)} <Change d={c.accuracy} unit="pp" /></td>
                          <td className="p-3">{pct(c.participationRate.current)} <Change d={c.participationRate} unit="pp" /></td>
                          <td className="p-3">{c.minutesPerActive.current ?? 0} min <Change d={c.minutesPerActive} unit="min" /></td>
                          <td className="p-3">{c.submissions.current ?? 0} <Change d={c.submissions} unit="count" /></td>
                          <td className="p-3">{c.studentsAtRisk.current ?? 0} <Change d={c.studentsAtRisk} unit="count" lowerIsBetter /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-graphite-500">Variação em relação aos {days} dias anteriores. Acerto só aparece com pelo menos 10 respostas.</p>
                {classes.subjects.length > 0 && (
                  <div className="mt-5 overflow-x-auto rounded-2xl border bg-white">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead className="bg-surface-card text-left text-xs text-graphite-500">
                        <tr><th className="p-3">Matéria (acerto)</th>{classes.classes.map((c) => <th key={c.id} className="p-3">{c.name}</th>)}</tr>
                      </thead>
                      <tbody>
                        {classes.subjects.map((s) => (
                          <tr key={s.subject} className="border-t"><td className="p-3">{s.subject}</td>{classes.classes.map((c) => <td key={c.id} className="p-3">{pct(s.byClass[c.id] ?? null)}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {!isStaff && me && (
          <>
            <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Acerto nas questões', d: me.self.questionAccuracy, value: pct(me.self.questionAccuracy.current), unit: 'pp' as const },
                { label: 'Questões respondidas', d: me.self.questionsAnswered, value: String(me.self.questionsAnswered.current ?? 0), unit: 'count' as const },
                { label: 'Tempo de estudo', d: me.self.studyMinutes, value: `${me.self.studyMinutes.current ?? 0} min`, unit: 'min' as const },
                { label: 'Média nas redações', d: me.self.essayAverage, value: me.self.essayAverage.current === null ? '—' : String(Math.round(me.self.essayAverage.current)), unit: 'points' as const },
              ].map((k) => (
                <div key={k.label} className="rounded-2xl border bg-white p-4">
                  <p className="text-xs text-graphite-500">{k.label}</p>
                  <p className="mt-1 text-2xl font-bold">{k.value}</p>
                  <Change d={k.d} unit={k.unit} /> <span className="text-xs text-graphite-400">vs. período anterior</span>
                </div>
              ))}
            </section>
            {me.self.subjects.length > 0 && (
              <section className="mt-5 rounded-2xl border bg-white p-5">
                <h2 className="font-semibold">Por matéria</h2>
                <ul className="mt-2 divide-y text-sm">
                  {me.self.subjects.map((s) => (
                    <li key={s.subject} className="flex justify-between py-2"><span>{s.subject}</span><span>{pct(s.current)} <Change d={s} unit="pp" /></span></li>
                  ))}
                </ul>
              </section>
            )}
            {me.classes.map((c) => (
              <section key={c.id} className="mt-5 rounded-2xl border bg-white p-5 text-sm">
                <h2 className="font-semibold">Você e a turma {c.name}</h2>
                <p className="mt-2">Acerto: {versusText(c.accuracy, 'pp')}</p>
                <p className="mt-1">Tempo de estudo: {versusText(c.studyMinutes, 'min')}</p>
              </section>
            ))}
          </>
        )}
      </div>
    </main>
  );
}
