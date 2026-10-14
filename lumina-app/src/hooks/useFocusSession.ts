import { useCallback, useEffect, useState } from "react";

/**
 * Estado da Sala de Foco (cronômetro de estudos).
 *
 * A sessão vive no `sessionStorage` de propósito: ela atravessa recarregamento
 * e navegação para outras telas do app — ou seja, o cronômetro continua
 * valendo enquanto o app estiver aberto — e morre junto com a aba, em vez de
 * deixar um registro de tempo pendurado para sempre.
 *
 * O tempo decorrido é calculado a partir do relógio (`Date.now()`) e não da
 * contagem de ticks: quando o navegador limita o `setInterval` de uma aba em
 * segundo plano, contar ticks perde minutos sem o aluno perceber.
 */
const STORAGE_KEY = "lumina.sala-de-foco.v1";

interface PersistedFocus {
  subjectId: string;
  running: boolean;
  /** Epoch (ms) em que o cronômetro foi ligado na rodada atual. */
  startedAt: number | null;
  /** Segundos somados de rodadas anteriores (pausas, reinícios, salvos). */
  accumulatedSeconds: number;
}

function read(initialSubjectId: string): PersistedFocus {
  const empty: PersistedFocus = {
    subjectId: initialSubjectId,
    running: false,
    startedAt: null,
    accumulatedSeconds: 0,
  };
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<PersistedFocus>;
    return {
      subjectId: typeof parsed.subjectId === "string" && parsed.subjectId ? parsed.subjectId : initialSubjectId,
      running: parsed.running === true && typeof parsed.startedAt === "number",
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : null,
      accumulatedSeconds:
        typeof parsed.accumulatedSeconds === "number" && parsed.accumulatedSeconds >= 0
          ? parsed.accumulatedSeconds
          : 0,
    };
  } catch {
    return empty;
  }
}

export interface FocusSession {
  subjectId: string;
  running: boolean;
  elapsedSeconds: number;
  hasProgress: boolean;
  selectSubject: (subjectId: string) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  /** Consome o tempo acumulado depois que o registro foi salvo no backend. */
  clearElapsed: () => void;
}

export function useFocusSession(initialSubjectId: string): FocusSession {
  const [state, setState] = useState<PersistedFocus>(() => read(initialSubjectId));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Modo privado ou cota cheia: a sessão segue só em memória.
    }
  }, [state]);

  useEffect(() => {
    if (!state.running || !state.startedAt) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [state.running, state.startedAt]);

  const elapsedSeconds =
    state.accumulatedSeconds +
    (state.running && state.startedAt ? Math.max(0, Math.floor((now - state.startedAt) / 1000)) : 0);

  // A lista de matérias chega depois do primeiro render (o cronograma é
  // carregado da API). Enquanto não houver escolha válida, usa a primeira.
  useEffect(() => {
    if (!initialSubjectId) return;
    if (!state.subjectId) {
      setState((current) => ({ ...current, subjectId: initialSubjectId }));
    }
  }, [initialSubjectId, state.subjectId]);

  const selectSubject = useCallback((subjectId: string) => {
    setState((current) => ({ ...current, subjectId }));
  }, []);

  const start = useCallback(() => {
    setState((current) => {
      if (current.running) return current;
      return { ...current, running: true, startedAt: Date.now() };
    });
    setNow(Date.now());
  }, []);

  const pause = useCallback(() => {
    setState((current) => {
      if (!current.running || !current.startedAt) return current;
      const extra = Math.max(0, Math.floor((Date.now() - current.startedAt) / 1000));
      return {
        ...current,
        running: false,
        startedAt: null,
        accumulatedSeconds: current.accumulatedSeconds + extra,
      };
    });
  }, []);

  const reset = useCallback(() => {
    setState((current) => ({ ...current, running: false, startedAt: null, accumulatedSeconds: 0 }));
  }, []);

  const clearElapsed = useCallback(() => {
    setState((current) => ({
      ...current,
      running: false,
      startedAt: null,
      accumulatedSeconds: 0,
    }));
  }, []);

  return {
    subjectId: state.subjectId,
    running: state.running,
    elapsedSeconds,
    hasProgress: elapsedSeconds > 0,
    selectSubject,
    start,
    pause,
    reset,
    clearElapsed,
  };
}
