/** Ponte entre o navegador (câmera, arquivo, canvas) e o RasterImage do doc-scanner. */
import type { RasterImage } from '@/lib/doc-scanner';

/** Maior lado da foto que entra no processamento: acima disso só pesa memória. */
export const MAX_INPUT_SIDE = 2400;
/** Maior lado da página digitalizada enviada para leitura. */
export const MAX_OUTPUT_SIDE = 1800;

function canvasFrom(source: CanvasImageSource, width: number, height: number, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas indisponível neste navegador.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function rasterOf(canvas: HTMLCanvasElement): RasterImage {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width, height, data };
}

/** Lê uma foto escolhida/capturada, já respeitando a orientação EXIF. */
export async function fileToRaster(file: Blob, maxSide = MAX_INPUT_SIDE): Promise<RasterImage> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem (JPEG, PNG ou HEIC convertido).');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    return rasterOf(canvasFrom(bitmap, bitmap.width, bitmap.height, maxSide));
  } finally {
    bitmap.close();
  }
}

/** Captura o quadro atual da câmera. */
export function videoToRaster(video: HTMLVideoElement, maxSide = MAX_INPUT_SIDE): RasterImage {
  if (!video.videoWidth) throw new Error('A câmera ainda não está pronta.');
  return rasterOf(canvasFrom(video, video.videoWidth, video.videoHeight, maxSide));
}

export function rasterToCanvas(img: RasterImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return canvas;
}

/**
 * JPEG da página para envio. Reduz a qualidade até caber em ~2,5 MB (o
 * servidor aceita até 3 MB por página).
 */
export function rasterToJpeg(img: RasterImage, maxBytes = 2.5 * 1024 * 1024): string {
  const canvas = rasterToCanvas(img);
  for (const quality of [0.88, 0.8, 0.7, 0.6, 0.5]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if ((url.length * 3) / 4 <= maxBytes) return url;
  }
  return canvas.toDataURL('image/jpeg', 0.4);
}

/**
 * Página em tons de cinza (1 byte por pixel) na largura pedida — vai para o
 * PDF do cartão-resposta (lib/pdf-writer), que o servidor lê sem precisar
 * decodificar JPEG.
 */
export function rasterToGrayPage(img: RasterImage, targetWidth = 1100): { width: number; height: number; data: Uint8Array } {
  const source = rasterToCanvas(img);
  const width = targetWidth;
  const height = Math.round((img.height * targetWidth) / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = Math.round(0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]);
  return { width, height, data: gray };
}

/** Libera a thread de interface antes de um processamento pesado (mostra o "processando"). */
export const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
