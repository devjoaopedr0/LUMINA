import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Minus, Target, TrendingDown, TrendingUp } from "lucide-react";
import { type CutoffTarget, apiGetCutoffTarget } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

/** Abaixo disso (pontos por edição) a nota é mostrada como estável. */
const STABLE_TREND = 0.5;

function formatScore(score: number): string {
  return score.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function Trend({ value }: { value: number }) {
  if (Math.abs(value) < STABLE_TREND) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-graphite/5 px-2 py-0.5 text-xs font-semibold text-graphite-500">
        <Minus className="h-3 w-3" /> estável
      </span>
    );
  }
  const rising = value > 0;
  const Icon = rising ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        rising ? "bg-alert/10 text-alert" : "bg-success/10 text-success"
      }`}
    >
      <Icon className="h-3 w-3" />
      {rising ? "+" : "−"}{formatScore(Math.abs(value))} por edição
    </span>
  );
}

interface CutoffTargetCardProps {
  /** Muda quando o perfil é salvo, para a meta ser buscada de novo. */
  refreshKey?: unknown;
  /** No próprio perfil não faz sentido mandar o aluno "para o perfil". */
  linkToProfile?: boolean;
  /** Só a meta e a tendência, sem a tabela por campus (formulários). */
  compact?: boolean;
  className?: string;
}

/**
 * Meta de nota do aluno: a nota de corte do Sisu projetada para a próxima
 * edição, pela tendência das últimas, para o curso, a universidade e a
 * modalidade do cadastro. Quando falta dado ou o curso não é encontrado, diz
 * o que fazer em vez de sumir.
 */
export function CutoffTargetCard({ refreshKey, linkToProfile = true, compact = false, className = "" }: CutoffTargetCardProps) {
  const [target, setTarget] = useState<CutoffTarget | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    let active = true;
    apiGetCutoffTarget(token)
      .then((result) => { if (active) setTarget(result); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [refreshKey]);

  if (!target) return null;

  const profileLink = linkToProfile && (
    <Link to="/app/perfil" className="font-semibold text-primary-700 underline-offset-2 hover:underline">
      Ajustar no perfil
    </Link>
  );

  if (target.status !== "OK" || target.targetScore === null) {
    return (
      <div className={`flex items-start gap-3 rounded-2xl border border-surface-line bg-white p-4 ${className}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-graphite/5">
          <Target className="h-4 w-4 text-graphite-500" />
        </div>
        <div className="text-sm">
          <p className="font-semibold text-graphite">Meta de nota pelo Sisu</p>
          <p className="mt-1 text-graphite-500">{target.message} {profileLink}</p>
        </div>
      </div>
    );
  }

  const top = target.offers[0];
  const period = target.years.length > 1
    ? `${target.years[0]}–${target.years[target.years.length - 1]}`
    : String(target.years[0]);

  return (
    <div className={`rounded-2xl border border-primary/30 bg-primary/5 p-5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/20">
            <Target className="h-5 w-5 text-graphite" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-graphite-500">
              Meta no ENEM{target.projectedYear ? ` · Sisu ${target.projectedYear}` : ""}
            </p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-3xl font-bold tracking-tight text-graphite">
                {formatScore(target.targetScore)}
                <span className="ml-1.5 text-sm font-medium text-graphite-400">de média</span>
              </p>
              <Trend value={target.trendPerYear ?? 0} />
            </div>
            <p className="mt-1 text-xs text-graphite-500">
              {top.courseName} · {top.institutionAcronym} · {target.modalityLabel}
            </p>
          </div>
        </div>

        {!compact && (
          <table className="text-xs">
            <thead>
              <tr className="text-graphite-400">
                <th className="pb-1 pr-4 text-left font-medium">Campus</th>
                {target.years.map((year) => (
                  <th key={year} className="pb-1 pr-4 text-right font-medium">{year}</th>
                ))}
                <th className="pb-1 text-right font-medium">{target.projectedYear ?? "Meta"}</th>
              </tr>
            </thead>
            <tbody>
              {target.offers.map((offer) => (
                <tr key={offer.courseCode} className="border-t border-primary/15">
                  <td className="py-1.5 pr-4 font-medium text-graphite">{offer.city} · {offer.shift}</td>
                  {target.years.map((year) => {
                    const entry = offer.scores.find((score) => score.year === year);
                    return (
                      <td key={year} className="py-1.5 pr-4 text-right text-graphite-500">
                        {entry ? formatScore(entry.score) : "—"}
                      </td>
                    );
                  })}
                  <td className="py-1.5 text-right font-bold text-graphite">{formatScore(offer.projected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-xs text-graphite-500">
        Projeção pela nota de corte de {period}
        {target.averageScore !== null ? ` (média ${formatScore(target.averageScore)})` : ""}; é recalculada a cada edição. {profileLink}
      </p>
    </div>
  );
}
