import { useEffect, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { apiGetMasteryEvolution } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { linePaths, seriesChange, shortDate, type MasteryEvolution } from '@/lib/mastery-evolution';

const WIDTH = 560;
const HEIGHT = 140;

/** Evolução do domínio nas últimas 8 semanas: geral, por matéria e o que mudou na semana. */
export function MasteryEvolutionCard() {
  const [data, setData] = useState<MasteryEvolution | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    apiGetMasteryEvolution(getAccessToken() ?? '', 8)
      .then((evolution) => { if (active) setData(evolution); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  if (failed) return null;
  if (!data) return <p role="status" className="mt-6 text-sm text-graphite-500">Carregando a evolução…</p>;
  const hasData = data.overall.some((value) => value !== null);
  const change = seriesChange(data.overall);

  return (
    <Card className="mt-6 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Evolução nas últimas 8 semanas</h2>
        {change ? <p className="text-sm text-graphite-500">Domínio médio: <strong>{change}</strong> pontos no período</p> : null}
      </div>
      {!hasData ? (
        <p className="mt-3 text-sm text-graphite-500">A evolução aparece depois de alguns dias de estudo: cada dia com questões respondidas vira um ponto.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT + 18}`} className="mt-4 w-full" role="img" aria-label={`Domínio médio por semana: ${data.overall.map((v, i) => `${shortDate(data.points[i])} ${v ?? 'sem dado'}`).join(', ')}`}>
            {[25, 50, 75].map((line) => (
              <line key={line} x1={0} x2={WIDTH} y1={4 + (HEIGHT - 8) * (1 - line / 100)} y2={4 + (HEIGHT - 8) * (1 - line / 100)} stroke="currentColor" className="text-surface-line" strokeDasharray="3 4" />
            ))}
            {linePaths(data.overall, WIDTH, HEIGHT).map((d) => (
              <path key={d} d={d} fill="none" stroke="currentColor" className="text-primary-700" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {data.points.map((point, i) => (
              <text key={point} x={4 + (i * (WIDTH - 8)) / Math.max(1, data.points.length - 1)} y={HEIGHT + 14} textAnchor={i === 0 ? 'start' : i === data.points.length - 1 ? 'end' : 'middle'} className="fill-graphite-400 text-[10px]">
                {shortDate(point)}
              </text>
            ))}
          </svg>

          {data.subjects.length > 1 ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {data.subjects.map((s) => (
                <li key={s.subject} className="flex items-center justify-between gap-3 rounded-xl border border-surface-line px-3 py-2 text-sm">
                  <span className="font-medium">{s.subject}</span>
                  <svg viewBox="0 0 120 32" className="h-8 w-28" aria-hidden="true">
                    {linePaths(s.series, 120, 32, 2).map((d) => <path key={d} d={d} fill="none" stroke="currentColor" className="text-graphite" strokeWidth={2} />)}
                  </svg>
                  <span className="w-10 text-right text-xs text-graphite-500">{seriesChange(s.series) ?? '—'}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><TrendingUp className="h-4 w-4" />Subiu nesta semana</h3>
              {data.week.improved.length ? (
                <ul className="mt-2 space-y-1 text-sm">{data.week.improved.map((c) => <li key={c.topicId}>{c.topic} <span className="text-graphite-400">({c.subject})</span>: {c.from} → {c.to}</li>)}</ul>
              ) : <p className="mt-2 text-sm text-graphite-400">Nenhum assunto subiu nos últimos 7 dias.</p>}
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-red-700"><TrendingDown className="h-4 w-4" />Caiu nesta semana</h3>
              {data.week.declined.length ? (
                <ul className="mt-2 space-y-1 text-sm">{data.week.declined.map((c) => <li key={c.topicId}>{c.topic} <span className="text-graphite-400">({c.subject})</span>: {c.from} → {c.to}</li>)}</ul>
              ) : <p className="mt-2 text-sm text-graphite-400">Nenhum assunto caiu nos últimos 7 dias.</p>}
            </div>
          </div>
          {data.week.started ? <p className="mt-3 text-xs text-graphite-500">{data.week.started} assunto(s) começaram a ser estudados nesta semana.</p> : null}
        </>
      )}
    </Card>
  );
}
