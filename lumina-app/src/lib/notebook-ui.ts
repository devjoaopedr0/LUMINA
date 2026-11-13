/** Utilitários de tela dos cadernos (fora do arquivo do componente, por causa do fast refresh). */

export const fieldClass = 'mt-1.5 w-full rounded-xl border border-surface-line bg-white px-4 py-3 text-sm text-graphite outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary/30';

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
