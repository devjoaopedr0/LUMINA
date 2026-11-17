export type AiChatMode = "SOCRATIC";

export interface AiChatPayloadHistoryMessage {
  role: "assistant" | "user";
  content: string;
  /** A mensagem tinha imagem: a imagem não é reenviada, só a indicação. */
  image?: string;
}

export interface AiChatPayloadOptions {
  scheduleTaskId?: string;
  questionId?: string;
  mode?: AiChatMode;
  /** Imagem da mensagem atual (data URL JPEG/PNG/WEBP). */
  image?: string;
}

/** O que o modelo lê no histórico quando uma mensagem antiga tinha imagem. */
export const IMAGE_NOTE = "[O aluno enviou uma imagem nesta mensagem.]";

/**
 * Corpo enviado para `POST /ai/chat`.
 *
 * Fica separado do widget para ser testável sem browser: o histórico local
 * carrega `id`, mas o DTO do backend roda com forbidNonWhitelisted e recusaria
 * esse campo. Só o que o servidor aceita entra no corpo. Imagens antigas não
 * são reenviadas (custo e cota): o histórico só avisa que havia uma.
 */
export function buildAiChatPayload(
  message: string,
  history: AiChatPayloadHistoryMessage[],
  options: AiChatPayloadOptions = {},
): string {
  return JSON.stringify({
    message: { role: "user", content: message },
    history: history.map(({ role, content, image }) => ({ role, content: image ? `${content}\n\n${IMAGE_NOTE}` : content })),
    // Os ids bastam: o contexto da tarefa e da questão é montado no servidor.
    ...(options.scheduleTaskId ? { scheduleTaskId: options.scheduleTaskId } : {}),
    ...(options.questionId ? { questionId: options.questionId } : {}),
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.image ? { image: options.image } : {}),
  });
}
