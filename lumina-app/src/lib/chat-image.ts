/**
 * Imagem enviada à LuminIA no chat (foto de questão, print, anotação).
 * Reduzida no navegador antes do envio: lado maior até 1600 px, JPEG. Foto
 * de celular (4–8 MB) vira algo entre 200 e 600 KB, e o modelo de visão lê
 * texto de questão bem nessa resolução.
 */
export const MAX_IMAGE_SIDE = 1600;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_IMAGE = /^image\/(jpeg|png|webp|gif|heic|heif|bmp)$/i;

/** Tamanho final mantendo a proporção. */
export function fitSize(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const scale = max / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Bytes de um data URL base64 (aproximado pelo tamanho do base64). */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}

export class ChatImageError extends Error {}

/** Lê o arquivo, reduz e devolve um data URL JPEG. */
export async function prepareChatImage(file: Blob): Promise<string> {
  if (file.type && !ACCEPTED_IMAGE.test(file.type)) throw new ChatImageError('Envie uma imagem (JPG, PNG ou WEBP).');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ChatImageError('Não foi possível abrir essa imagem. Tente uma foto em JPG ou PNG.');
  }
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ChatImageError('Seu navegador não conseguiu preparar a imagem.');
  ctx.fillStyle = '#fff'; // PNG com transparência vira fundo branco, não preto.
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  if (dataUrlBytes(dataUrl) > MAX_IMAGE_BYTES) throw new ChatImageError('A imagem ficou grande demais mesmo reduzida. Recorte só a parte da questão.');
  return dataUrl;
}
