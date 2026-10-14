import { getAccessToken } from "@/lib/auth";
import { createApiClient } from "@/lib/api-client-core";
import { clearTokens, getRefreshToken, setTokens } from "@/lib/auth";
import { API_URL } from "@/lib/config";

export interface AiChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
}

/** Evento que qualquer tela dispara para abrir a LuminIA já com uma
 * pergunta — ex.: "por que essa tarefa está no meu dia?" no cronograma. */
export const ASK_AI_EVENT = "lumina:ask-ai";

export interface AskAiDetail {
  message: string;
  scheduleTaskId?: string;
}

export function askAi(detail: AskAiDetail): void {
  window.dispatchEvent(new CustomEvent<AskAiDetail>(ASK_AI_EVENT, { detail }));
}

export class AiChatNotConfiguredError extends Error {
  constructor() {
    super("A integração com a IA ainda não foi configurada.");
  }
}

/**
 * O LuminIA usava um `fetch` próprio apontando para `/api/ai/chat`, mas o
 * backend serve as rotas na raiz (`/ai/chat`) e o proxy do Vite repassava o
 * prefixo `/api` adiante — a chamada morria com 404 e o widget mostrava
 * "Não consegui responder agora". Aqui passamos a usar o mesmo cliente do
 * resto do app, que já resolve a base URL, renova o token expirado e limpa a
 * sessão quando o refresh também falha.
 */
const apiClient = createApiClient({
  baseUrl: API_URL,
  setTokens,
  getRefreshToken,
  clearTokens,
  fetch: (...args) => fetch(...args),
});

/**
 * Ponto único de integração da LuminIA.
 * Chama o backend `POST /ai/chat`, que por sua vez chama o provedor
 * configurado (OpenRouter, OpenAI, Anthropic, Groq, ou mock).
 */
export async function sendAiChatMessage(
  message: string,
  history: AiChatMessage[],
  options: { scheduleTaskId?: string } = {},
): Promise<string> {
  if (!message.trim()) throw new Error("Mensagem vazia.");
  if (message.length > 4000) throw new Error("Mensagem muito longa (máx. 4000 caracteres).");

  const token = getAccessToken();
  if (!token) throw new AiChatNotConfiguredError();

  const res = await apiClient.request<{ message: string }>("/ai/chat", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    // O histórico local carrega um `id` por mensagem (o React precisa dele
    // como key), mas o DTO do backend roda com forbidNonWhitelisted e
    // recusaria o campo extra com 400. Enviamos só o que ele aceita.
    body: JSON.stringify({
      message: { role: "user", content: message },
      history: history.map(({ role, content }) => ({ role, content })),
      // Só o id da tarefa: o contexto do cronograma é montado no servidor.
      ...(options.scheduleTaskId ? { scheduleTaskId: options.scheduleTaskId } : {}),
    }),
  });
  return res.message;
}
