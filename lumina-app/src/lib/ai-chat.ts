export interface AiChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
}

export class AiChatNotConfiguredError extends Error {
  constructor() {
    super("A integração com a IA ainda não foi configurada.");
  }
}

const api = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
};

/**
 * Ponto único de integração da LuminIA.
 * Chama o backend `POST /ai/chat` que por sua vez chama o provedor configurado
 * (OpenAI, Anthropic, ou mock se nenhum provedor estiver configurado).
 */
export async function sendAiChatMessage(
  message: string,
  history: AiChatMessage[],
): Promise<string> {
  if (!message.trim()) throw new Error('Mensagem vazia.');
  if (message.length > 4000) throw new Error('Mensagem muito longa (máx. 4000 caracteres).');

  const res = await api<{ message: string }>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message: { role: 'user', content: message }, history }),
  });
  return res.message;
}