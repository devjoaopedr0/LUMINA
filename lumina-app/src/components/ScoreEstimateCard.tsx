import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gauge } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { type ScoreEstimate, type ScoreHistoryPoint, apiGetScoreEstimate, apiGetScoreEstimateHistory } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

/**
 * Nota estimada do ENEM, pelo desempenho do aluno nas questões do app — por
 * área e na média, sempre como faixa. É uma aproximação (a prova usa TRI) e o
 * cartão diz isso; área com poucas questões mostra quantas faltam em vez de
 * um número sem base.
 */
export function ScoreEstimateCard({ className = "" }: { className?: string }) {
  const [estimate, setEstimate] = useState<ScoreEstimate | null>(null);
  const [history, setHistory] = useState<ScoreHistoryPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    const token = getAccessToken() ?? "";
    apiGetScoreEstimate(token)
      .then((data) => !cancelled && setEstimate(data))
      .catch(() => undefined);
    apiGetScoreEstimateHistory(token)
      .then((data) => !cancelled && setHistory(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Sem resposta do servidor o cartão simplesmente não aparece.
  if (!estimate) return null;

  const { average, gap, target } = estimate;
  // Evolução: só as semanas que já tinham estimativa; precisa de duas para ter o que comparar.
  const points = history.filter((point) => point.estimate !== null);
  const scale = points.length
    ? {
        min: Math.min(...points.map((point) => point.estimate!)) - 20,
        max: Math.max(...points.map((point) => point.estimate!)) + 20,
      }
    : null;
  const weekDelta = points.length >= 2 ? points[points.length - 1].estimate! - points[points.length - 2].estimate! : null;

  return (
    <Card className={`bg-white p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Gauge className="h-5 w-5 text-primary-700" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">Sua nota estimada hoje</p>
            {average ? (
              <>
                <p className="mt-1 text-3xl font-bold text-graphite">
                  {average.estimate}
                  <span className="ml-2 text-sm font-medium text-graphite-400">
                    entre {average.low} e {average.high}
                  </span>
                </p>
                {!average.complete && (
                  <p className="mt-1 text-xs text-graphite-400">Média com {average.parts} das 5 notas do ENEM.</p>
                )}
              </>
            ) : (
              <p className="mt-1 max-w-xl text-sm text-graphite-500">{estimate.message}</p>
            )}
          </div>
        </div>

        {average && target && gap !== null && (
          <div className={`rounded-xl px-4 py-3 text-right ${gap > 0 ? "bg-orange-50" : "bg-success/10"}`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${gap > 0 ? "text-orange-600" : "text-success"}`}>
              {gap > 0 ? "Para a meta" : "Meta alcançada"}
            </p>
            <p className="mt-1 text-lg font-bold text-graphite">
              {gap > 0 ? `faltam ~${Math.round(gap)}` : `+${Math.round(-gap)} acima`}
            </p>
            <p className="text-xs text-graphite-400">meta {target.score.toLocaleString("pt-BR")}</p>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {estimate.areas.map((area) => (
          <div key={area.area} className="rounded-xl border border-surface-line p-3">
            <p className="truncate text-xs text-graphite-400">{area.label}</p>
            {area.estimate !== null ? (
              <>
                <p className="mt-1 text-lg font-bold text-graphite">{area.estimate}</p>
                <p className="text-xs text-graphite-400">
                  {area.low}–{area.high} · {area.accuracy}% em {area.answered} questões
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-lg font-bold text-graphite-400">—</p>
                <p className="text-xs text-graphite-400">
                  {area.missing === 1 ? "falta 1 questão" : `faltam ${area.missing} questões`}
                </p>
              </>
            )}
          </div>
        ))}
        <div className="rounded-xl border border-surface-line p-3">
          <p className="truncate text-xs text-graphite-400">Redação</p>
          {estimate.essay.score !== null ? (
            <>
              <p className="mt-1 text-lg font-bold text-graphite">{estimate.essay.score}</p>
              <p className="text-xs text-graphite-400">
                média de {estimate.essay.corrections} {estimate.essay.corrections === 1 ? "correção" : "correções"}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-lg font-bold text-graphite-400">—</p>
              <p className="text-xs text-graphite-400">sem redação corrigida</p>
            </>
          )}
        </div>
      </div>

      {points.length >= 2 && scale && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">Evolução semana a semana</p>
            {weekDelta !== null && weekDelta !== 0 && (
              <p className={`text-xs font-semibold ${weekDelta > 0 ? "text-success" : "text-alert"}`}>
                {weekDelta > 0 ? "▲" : "▼"} {Math.abs(weekDelta)} em relação à semana passada
              </p>
            )}
          </div>
          <div className="mt-3 flex h-24 items-end gap-2" role="img" aria-label="Média estimada ao fim de cada semana">
            {history.map((point) => (
              <div key={point.weekStart} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                {point.estimate !== null ? (
                  <>
                    <span className="text-[11px] font-semibold text-graphite">{point.estimate}</span>
                    <div
                      className="w-full rounded-t-md bg-primary"
                      style={{ height: `${Math.max(8, ((point.estimate - scale.min) / (scale.max - scale.min)) * 70)}%` }}
                    />
                  </>
                ) : (
                  <div className="h-px w-full bg-surface-line" />
                )}
                <span className="text-[10px] text-graphite-400">
                  {point.weekStart.slice(8, 10)}/{point.weekStart.slice(5, 7)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-graphite-400">
        Estimativa aproximada, calculada pelos seus acertos nas questões do app nos últimos meses (as difíceis pesam
        mais). A nota real do ENEM usa TRI e pode ficar fora dessa faixa.{" "}
        <Link to="/app/questoes" className="font-semibold text-primary-700 hover:underline">
          Responder mais questões
        </Link>{" "}
        deixa a estimativa mais precisa.
      </p>
    </Card>
  );
}
