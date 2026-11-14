import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiGetSkillMastery } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  AREA_SHORT,
  BAND_CLASS,
  BAND_LABEL,
  ENEM_AREAS,
  skillBand,
  skillsToPractice,
  type EnemArea,
  type SkillBand,
  type SkillMasteryReport,
  type SkillMasteryRow,
} from "@/lib/enem-skills";

/**
 * Mapa por habilidade da Matriz de Referência do ENEM: área → competência →
 * H1–H30, colorido pelo percentual de acerto (nunca convertido em nota TRI).
 * Só pinta habilidade com o mínimo de respostas; abaixo disso, mostra
 * "poucas respostas".
 */
export function SkillMasteryView() {
  const [report, setReport] = useState<SkillMasteryReport | null>(null);
  const [error, setError] = useState("");
  const [area, setArea] = useState<EnemArea>("MT");
  const [selected, setSelected] = useState<SkillMasteryRow | null>(null);

  useEffect(() => {
    apiGetSkillMastery(getAccessToken() ?? "")
      .then((r) => {
        setReport(r);
        // Abre na área com mais respostas.
        const best = [...r.areas].sort((a, b) => b.attempts - a.attempts)[0];
        if (best && best.attempts > 0) setArea(best.area);
      })
      .catch(() => setError("Não foi possível carregar o mapa por habilidade."));
  }, []);

  if (error) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</p>;
  if (!report) return <p role="status" className="rounded-xl bg-white p-6 text-sm text-graphite-500">Carregando o mapa por habilidade…</p>;

  const current = report.areas.find((a) => a.area === area)!;
  const practice = skillsToPractice(report, area);
  const accuracy = current.attempts ? Math.round((current.correct / current.attempts) * 100) : null;

  return (
    <div className="space-y-5">
      <Card className="bg-white p-5">
        <p className="text-sm text-graphite-500">
          Cada quadrado é uma habilidade (H1 a H30) da{" "}
          <a href={report.source} target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">
            Matriz de Referência do ENEM
          </a>
          . A cor mostra o seu percentual de acerto nas questões daquela habilidade, em questões avulsas e simulados.
          É acerto, não nota do ENEM: a nota TRI depende dos parâmetros de cada item.
        </p>
        <p className="mt-2 text-xs text-graphite-400">
          {report.classifiedQuestions} questões do banco já têm habilidade
          {report.pendingValidation ? `; ${report.pendingValidation} delas por sugestão da IA, ainda sem validação de um professor` : ""}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Área do ENEM">
          {ENEM_AREAS.map((a) => {
            const info = report.areas.find((x) => x.area === a)!;
            return (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={area === a}
                onClick={() => { setArea(a); setSelected(null); }}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${area === a ? "bg-graphite text-white" : "bg-surface-card text-graphite"}`}
              >
                {AREA_SHORT[a]}
                <span className="ml-1.5 font-normal opacity-70">{info.attempts}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {current.attempts === 0 ? (
        <Card className="bg-white p-6">
          <h2 className="text-lg font-bold">Nenhuma resposta em {AREA_SHORT[area]} ainda</h2>
          <p className="mt-2 text-sm text-graphite-500">
            O mapa nasce das suas respostas em questões que já têm habilidade. Comece por uma destas:
          </p>
        </Card>
      ) : (
        <p className="text-sm text-graphite-500">
          {current.name}: {current.attempts} respostas, {accuracy}% de acerto.
        </p>
      )}

      {practice.length ? (
        <Card className="bg-white p-5">
          <h2 className="font-bold">Praticar agora</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {practice.map((s) => (
              <li key={s.code} className="rounded-xl border border-surface-line p-3 text-sm">
                <p className="font-semibold">
                  H{s.n} · {s.attempts ? `${s.accuracy}% de acerto em ${s.attempts}` : "ainda não respondida"}
                </p>
                <p className="mt-1 line-clamp-3 text-graphite-500">{s.text}</p>
                <Link to={`/app/questoes?enemSkill=${s.code}`} className="mt-2 inline-block text-sm font-semibold text-primary-700 underline">
                  {s.available} {s.available === 1 ? "questão" : "questões"}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {current.competencies.map((c) => (
          <Card key={c.n} className="bg-white p-5">
            <h3 className="font-bold">Competência {c.n}</h3>
            <p className="mt-1 text-xs text-graphite-500">{c.text}</p>
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {c.skills.map((s) => {
                const band: SkillBand = skillBand(s, report.minAttempts);
                return (
                  <li key={s.code}>
                    <button
                      type="button"
                      onClick={() => setSelected(selected?.code === s.code ? null : s)}
                      aria-pressed={selected?.code === s.code}
                      aria-label={`H${s.n}: ${BAND_LABEL[band]}${s.attempts ? `, ${s.accuracy}% em ${s.attempts} respostas` : ""}`}
                      title={s.text}
                      className={`flex h-16 w-full flex-col items-center justify-center rounded-xl text-xs font-bold ${BAND_CLASS[band]} ${selected?.code === s.code ? "ring-2 ring-graphite" : ""}`}
                    >
                      H{s.n}
                      <span className="font-normal">{s.attempts ? `${s.accuracy}%` : "—"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {selected && c.skills.some((s) => s.code === selected.code) ? (
              <div className="mt-3 rounded-xl bg-surface-card p-3 text-sm">
                <p className="font-semibold">H{selected.n} — {BAND_LABEL[skillBand(selected, report.minAttempts)]}</p>
                <p className="mt-1 text-graphite-500">{selected.text}</p>
                <p className="mt-2">
                  {selected.attempts
                    ? `${selected.correct} de ${selected.attempts} certas (${selected.accuracy}%).`
                    : "Você ainda não respondeu questões desta habilidade."}
                  {selected.attempts > 0 && selected.attempts < report.minAttempts ? ` Com menos de ${report.minAttempts} respostas, o percentual ainda diz pouco.` : ""}
                  {selected.provisional ? " Parte destas questões tem habilidade sugerida pela IA, ainda sem validação." : ""}
                </p>
                {selected.available ? (
                  <Link to={`/app/questoes?enemSkill=${selected.code}`}>
                    <Button size="sm" className="mt-3">Praticar {selected.available} {selected.available === 1 ? "questão" : "questões"}</Button>
                  </Link>
                ) : (
                  <p className="mt-2 text-xs text-graphite-400">O banco ainda não tem questões classificadas nesta habilidade.</p>
                )}
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-graphite-500" aria-label="Legenda">
        {(Object.keys(BAND_LABEL) as SkillBand[]).map((b) => (
          <span key={b} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded ${BAND_CLASS[b]}`} />{BAND_LABEL[b]}
          </span>
        ))}
      </div>
    </div>
  );
}
