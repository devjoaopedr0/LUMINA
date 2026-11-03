import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '@/lib/auth';
import { apiEssayCorrection, apiEssayCorrectionQuota, apiEssayCorrectionRequest, ApiError, type EssayCorrection, type EssayCorrectionQuota } from '@/lib/api';

const POLL_MS = 3000;

/** Cota mensal de correções por IA do aluno (null enquanto carrega ou se falhar). */
export function useEssayCorrectionQuota() {
  const [quota, setQuota] = useState<EssayCorrectionQuota | null>(null);
  const refresh = useCallback(async () => {
    try {
      setQuota(await apiEssayCorrectionQuota(getAccessToken() ?? ''));
    } catch {
      // Sem a cota, a tela só não mostra o contador; o servidor continua limitando.
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { quota, setQuota, refresh };
}

/** "3 de 4 correções por IA restantes em novembro" / "Renova em 1º de dezembro". */
export function quotaLabel(quota: EssayCorrectionQuota): string {
  const month = new Date(`${quota.period}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
  if (quota.remaining <= 0) {
    const next = new Date(quota.resetsAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' });
    return `Você usou as ${quota.limit} correções por IA de ${month}. Renova em ${next.replace(/^1 /, '1º ')}.`;
  }
  return `${quota.remaining} de ${quota.limit} ${quota.limit === 1 ? 'correção' : 'correções'} por IA ${quota.remaining === 1 ? 'restante' : 'restantes'} em ${month}.`;
}

/** Acompanha a correção de uma redação: pede, consulta até terminar e mostra. */
export function useEssayCorrection(essayId: string | null) {
  const [correction, setCorrection] = useState<EssayCorrection | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);
  const { quota, setQuota, refresh: refreshQuota } = useEssayCorrectionQuota();

  const load = useCallback(async () => {
    if (!essayId) return;
    try {
      const data = await apiEssayCorrection(getAccessToken() ?? '', essayId);
      setCorrection(data);
      setError('');
      if (data.status === 'IN_PROGRESS') timer.current = window.setTimeout(() => void load(), POLL_MS);
      // Correção que falhou devolve o crédito: atualiza o contador.
      else if (data.status === 'FAILED' || data.method === 'modelo-estatistico') void refreshQuota();
    } catch {
      // Falha ao consultar não é o mesmo que "sem correção": avisa e tenta de novo.
      setError('Não foi possível consultar a correção agora. Tentando de novo…');
      timer.current = window.setTimeout(() => void load(), POLL_MS * 2);
    }
  }, [essayId, refreshQuota]);

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
      if (data.quota) setQuota(data.quota);
      if (timer.current) window.clearTimeout(timer.current);
      if (data.status === 'IN_PROGRESS') timer.current = window.setTimeout(() => void load(), POLL_MS);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível pedir a correção.');
      if (e instanceof ApiError && e.status === 429) void refreshQuota();
    } finally {
      setBusy(false);
    }
  }, [busy, essayId, load, refreshQuota, setQuota]);

  return { correction, error, busy, request, setCorrection, quota, setQuota, refreshQuota };
}
