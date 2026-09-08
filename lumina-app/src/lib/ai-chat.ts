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

/**
 * Ponto único de integração da LuminIA.
 * Substitua esta implementação por uma chamada ao backend. O componente de
 * interface já trata carregamento, histórico da sessão e falhas.
 */
export async function sendAiChatMessage(
  _message: string,
  _history: AiChatMessage[],
): Promise<string> {
  throw new AiChatNotConfiguredError();
}
