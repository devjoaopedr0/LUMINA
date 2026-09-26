/** Link de origem exibido a partir de um resultado de busca.
 *
 * Um provedor de busca (ou um dado malformado) pode devolver qualquer
 * esquema. Só `http(s)` é navegável; qualquer outro — `javascript:`, `data:`,
 * Relative com destinos estranhos — vira `null` e a interface mostra o
 * endereço como texto puro, sem virar alvo de clique. Caminho relativo é
 * resolvido contra a própria origem, como os links internos da Lumina. */
export function safeSourceLink(link: string | undefined | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
