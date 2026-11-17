import { useState } from "react";
import { Link } from "react-router-dom";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { profileGoalText } from "@/lib/schedule-dates";

/**
 * Objetivo do cronograma: vem do perfil (curso desejado e universidade-alvo).
 * Com o perfil preenchido, só mostra e oferece trocar; sem curso no perfil,
 * pede para preencher ali mesmo — o que se salva aqui é o próprio perfil.
 */
export function ProfileGoalCard() {
  const { user, updateProfile } = useAuth();
  const goal = profileGoalText(user?.desiredCourse, user?.targetUniversity);
  const [editing, setEditing] = useState(!goal);
  const [course, setCourse] = useState(user?.desiredCourse ?? "");
  const [university, setUniversity] = useState(user?.targetUniversity ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!course.trim()) return setError("Informe o curso que você quer.");
    setSaving(true);
    setError("");
    try {
      await updateProfile({ desiredCourse: course.trim(), targetUniversity: university.trim() || null });
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível salvar no perfil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-surface-line bg-white p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-graphite"><Target className="h-4 w-4 text-primary-700" />Objetivo</p>
      {goal && !editing ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <span className="font-semibold">{goal}</span>{" "}
            <span className="text-graphite-400">(do seu perfil)</span>
          </p>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>Alterar no perfil</Button>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-xs text-graphite-500">
            {goal
              ? "A mudança vale para o seu perfil e para o cronograma."
              : "Seu perfil ainda não tem o curso que você quer. Preencha aqui: fica salvo no perfil e define o objetivo e a meta de nota do cronograma."}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="goal-course" className="mb-1 block text-xs font-medium text-graphite">Curso que você quer</label>
              <Input id="goal-course" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Ex.: Medicina" maxLength={120} />
            </div>
            <div>
              <label htmlFor="goal-university" className="mb-1 block text-xs font-medium text-graphite">Universidade-alvo (opcional)</label>
              <Input id="goal-university" value={university} onChange={(e) => setUniversity(e.target.value)} placeholder="Ex.: UFC" maxLength={120} />
            </div>
          </div>
          {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Salvar no meu perfil"}</Button>
            {goal ? <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button> : null}
            <Link to="/app/perfil" className="text-xs text-primary-700 underline">Abrir o perfil completo</Link>
          </div>
        </div>
      )}
    </div>
  );
}
