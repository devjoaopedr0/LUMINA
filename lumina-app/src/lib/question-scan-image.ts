/**
 * Prepara a foto da questão antes do envio: reduz para no máximo 1.800 px no
 * lado maior e regrava em JPEG. Uma foto de celular (4–12 MB) vira algo entre
 * 300 KB e 1 MB, dentro do limite de 3 MB do servidor, sem perder a leitura.
 */

export const SCAN_MAX_SIDE = 1800;
export const SCAN_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** Arquivo original aceito (antes de reduzir). */
export const SCAN_MAX_INPUT_BYTES = 20 * 1024 * 1024;

/** Dimensões finais mantendo a proporção; imagem menor que o limite não cresce. */
export function fitWithin(width: number, height: number, maxSide = SCAN_MAX_SIDE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Bytes aproximados de uma data URL base64. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Só no navegador: lê, reduz e devolve a data URL JPEG com as dimensões reais. */
export async function prepareScanImage(file: File): Promise<{ dataUrl: string; width: number; height: number; sizeBytes: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a foto neste navegador.');
    // Fundo branco: PNG com transparência viraria preto no JPEG.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { dataUrl, width, height, sizeBytes: dataUrlBytes(dataUrl) };
  } finally {
    bitmap.close();
  }
}
