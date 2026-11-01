import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '@/lib/auth';
import { apiEssayCorrection, apiEssayCorrectionRequest, ApiError, type EssayCorrection } from '@/lib/api';

const POLL_MS = 3000;

/** Acompanha a correção de uma redação: pede, consulta até terminar e mostra. */
export function useEssayCorrection(essayId: string | null) {
  const [correction, setCorrection] = useState<EssayCorrection | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!essayId) return;
    try {
      const data = await apiEssayCorrection(getAccessToken() ?? '', essayId);
      setCorrection(data);
      setError('');
      if (data.status === 'IN_PROGRESS') timer.current = window.setTimeout(() => void load(), POLL_MS);
    } catch {
      // Falha ao consultar não é o mesmo que "sem correção": avisa e tenta de novo.
      setError('Não foi possível consultar a correção agora. Tentando de novo…');
      timer.current = window.setTimeout(() => void load(), POLL_MS * 2);
    }
  }, [essayId]);

  useEffect(() => {
    void load();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [load]);

  const request = useCallback(async () => {
    if (!essayId || busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiEssayCorrectionRequest(getAccessToken() ?? '', essayId);
      setCorrection(data);
      if (timer.current) window.clearTimeout(timer.current);
      if (data.status === 'IN_PROGRESS') timer.current = window.setTimeout(() => void load(), POLL_MS);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível pedir a correção.');
    } finally {
      setBusy(false);
    }
  }, [busy, essayId, load]);

  return { correction, error, busy, request, setCorrection };
}

