import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '@/lib/config';
import { getAccessToken } from '@/lib/auth';

/** Sem socket (rede corporativa, servidor reiniciando), busca a cada 15 s. */
const POLL_WITHOUT_SOCKET_MS = 15_000;
/** Com socket, uma conferência de segurança por minuto. */
const POLL_WITH_SOCKET_MS = 60_000;

/**
 * Acompanha as salas de um grupo em tempo real. O servidor só avisa "mudou"
 * (nenhum dado pessoal passa pelo socket); quem chama busca o estado por HTTP.
 */
/** `event`: "rooms:changed" (salas) ou "chat:changed" (conversa e avisos). */
export function useGroupRoomsLive(groupId: string | undefined, onChanged: () => void, event: 'rooms:changed' | 'chat:changed' = 'rooms:changed') {
  const callback = useRef(onChanged);
  callback.current = onChanged;

  useEffect(() => {
    if (!groupId) return;
    let socket: Socket | null = null;
    let connected = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        callback.current();
        schedule();
      }, connected ? POLL_WITH_SOCKET_MS : POLL_WITHOUT_SOCKET_MS);
    };

    if (getAccessToken()) {
      // Função: cada (re)conexão leva o token atual — ele é renovado a cada 15 min.
      socket = io(`${API_URL}/groups`, {
        auth: (send) => send({ token: getAccessToken() }),
        transports: ['websocket', 'polling'],
        reconnectionDelayMax: 10_000,
      });
      socket.on('connect', () => {
        connected = true;
        socket?.emit('group:watch', { groupId });
        // Pode ter perdido avisos enquanto estava desconectado.
        callback.current();
        schedule();
      });
      socket.on('disconnect', () => {
        connected = false;
        schedule();
      });
      socket.on(event, (payload: { groupId?: string }) => {
        if (payload?.groupId === groupId) callback.current();
      });
    }
    schedule();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket?.emit('group:unwatch');
      socket?.disconnect();
    };
  }, [groupId, event]);
}
