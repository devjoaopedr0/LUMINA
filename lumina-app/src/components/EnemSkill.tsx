import { useEffect, useState } from "react";
import { apiGetEnemMatrix } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { areaForSubject, type EnemMatrix, type QuestionEnemSkill } from "@/lib/enem-skills";

/** Matriz de Referência do ENEM (texto oficial), carregada uma vez por sessão. */
export function useEnemMatrix(): EnemMatrix | null {
  const [matrix, setMatrix] = useState<EnemMatrix | null>(null);
  useEffect(() => {
    let alive = true;
    apiGetEnemMatrix(getAccessToken() ?? "")
      .then((m) => alive && setMatrix(m))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return matrix;
}

/** Selo da habilidade na questão. Sugestão da IA aparece como pendente. */
export function EnemSkillBadge({ skill }: { skill: QuestionEnemSkill }) {
  const pending = !skill.validated;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
        pending ? "border-amber-300 bg-amber-50 text-amber-800" : "border-primary/30 bg-primary/10 text-primary-700"
      }`}
      title={`${skill.code} — ${skill.text}${pending ? "\nClassificação sugerida pela IA, ainda não validada por um professor." : ""}`}
    >
      Habilidade {skill.code.replace("-", " ")}
      {pending ? <span className="font-normal">(sugestão da IA)</span> : null}
    </span>
  );
}

/**
 * Escolha da habilidade na edição da questão (quem gerencia o banco). Mostra
 * só as habilidades da área da matéria; se a sugestão da IA estiver
 * pendente, pede a confirmação explícita para validá-la.
 */
export function EnemSkillField({
  matrix,
  subject,
  initial,
  value,
  onChange,
  confirmed,
  onConfirm,
}: {
  matrix: EnemMatrix | null;
  subject: string;
  initial: QuestionEnemSkill | null | undefined;
  value: string;
  onChange: (code: string) => void;
  confirmed: boolean;
  onConfirm: (ok: boolean) => void;
}) {
  const area = areaForSubject(subject) ?? initial?.area ?? null;
  const areaMatrix = matrix?.areas.find((a) => a.area === area);
  const pendingAi = initial && !initial.validated && value === initial.code;
  return (
    <div className="md:col-span-2">
      <label htmlFor="enem-skill" className="mb-1.5 block text-sm font-medium text-graphite">
        Habilidade do ENEM (Matriz de Referência)
      </label>
      {!matrix ? (
        <p className="text-sm text-graphite-400">Carregando a matriz…</p>
      ) : !areaMatrix ? (
        <p className="text-sm text-graphite-400">Escolha uma matéria de uma das quatro áreas do ENEM para classificar a habilidade.</p>
      ) : (
        <>
          <select id="enem-skill" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-surface-line bg-white px-3 py-2.5 text-sm">
            <option value="">Sem habilidade</option>
            {areaMatrix.competencies.map((c) => (
              <optgroup key={c.n} label={`Competência ${c.n}`}>
                {areaMatrix.skills
                  .filter((s) => s.competency === c.n)
                  .map((s) => (
                    <option key={s.n} value={`${areaMatrix.area}-H${s.n}`}>
                      H{s.n} — {s.text.length > 110 ? `${s.text.slice(0, 110)}…` : s.text}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          {value ? <p className="mt-1.5 text-xs text-graphite-500">{areaMatrix.skills.find((s) => `${areaMatrix.area}-H${s.n}` === value)?.text}</p> : null}
          {pendingAi ? (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>
                <span className="font-semibold">Sugestão da IA, pendente.</span> {initial?.note}
              </p>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={confirmed} onChange={(e) => onConfirm(e.target.checked)} />
                Confirmo esta habilidade
              </label>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
