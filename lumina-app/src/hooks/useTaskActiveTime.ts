import { useEffect } from "react";
import { apiLogTime } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

/** Menos que isso (abriu e fechou) não é estudo: não vira registro. */
const MIN_SECONDS = 60;

/**
 * Mede o tempo ATIVO do aluno numa tarefa do cronograma — só conta enquanto a
 * aba está visível — e registra na tarefa quando a tela fecha. É o que permite
 * ao cronograma ajustar a duração de cada tipo de atividade ao ritmo do aluno
 * (calibração C2 — docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md).
 *
 * O tempo sai do relógio (`Date.now()`), não da contagem de ticks: o navegador
 * limita timers em segundo plano.
 */
export function useTaskActiveTime(taskId: string) {
  useEffect(() => {
    let activeMs = 0;
    let since: number | null = document.visibilityState === "visible" ? Date.now() : null;

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        since ??= Date.now();
      } else if (since !== null) {
        activeMs += Date.now() - since;
        since = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (since !== null) activeMs += Date.now() - since;
      if (activeMs < MIN_SECONDS * 1000) return;
      // Registro em segundo plano: falhar aqui não pode atrapalhar o aluno.
      apiLogTime(getAccessToken() ?? "", taskId, Math.round(activeMs / 60_000)).catch(() => undefined);
    };
  }, [taskId]);
}
