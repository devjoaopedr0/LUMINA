export type AiChatMode = "SOCRATIC";

export interface AiChatPayloadHistoryMessage {
  role: "assistant" | "user";
  content: string;
}

export interface AiChatPayloadOptions {
  scheduleTaskId?: string;
  questionId?: string;
  mode?: AiChatMode;
}

/**
 * Corpo enviado para `POST /ai/chat`.
 *
 * Fica separado do widget para ser testável sem browser: o histórico local
 * carrega `id`, mas o DTO do backend roda com forbidNonWhitelisted e recusaria
 * esse campo. Só o que o servidor aceita entra no corpo.
 */
export function buildAiChatPayload(
  message: string,
  history: AiChatPayloadHistoryMessage[],
  options: AiChatPayloadOptions = {},
): string {
  return JSON.stringify({
    message: { role: "user", content: message },
    history: history.map(({ role, content }) => ({ role, content })),
    // Os ids bastam: o contexto da tarefa e da questão é montado no servidor.
    ...(options.scheduleTaskId ? { scheduleTaskId: options.scheduleTaskId } : {}),
    ...(options.questionId ? { questionId: options.questionId } : {}),
    ...(options.mode ? { mode: options.mode } : {}),
  });
}
