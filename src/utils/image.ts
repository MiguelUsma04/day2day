/**
 * Image helpers. Browser only: they draw on a canvas.
 */

/** Draws `file` scaled so its longest side is at most `maxSide`. Honors EXIF orientation. Never upscales. */
async function drawScaled(file: Blob, maxSide: number): Promise<HTMLCanvasElement> {
  if (typeof document === 'undefined') {
    throw new Error('Image helpers require a browser environment');
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

/**
 * Downscales an image file to a JPEG and returns it as bare base64 (no data-URL
 * prefix). This is what the analysis receives: big enough for Claude to read the plate.
 */
export async function fileToJpegBase64(
  file: Blob,
  maxSide = 1000,
  quality = 0.8,
): Promise<{ base64: string; mediaType: 'image/jpeg' }> {
  const canvas = await drawScaled(file, maxSide);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export type StoredPhoto = { blob: Blob; ext: 'webp' | 'jpg'; contentType: 'image/webp' | 'image/jpeg' };

/**
 * The copy that gets stored: small (640 px, ~30-50 KB) so the free storage
 * tier lasts for years. WebP when the browser can encode it, JPEG otherwise.
 */
export async function fileToStoredPhoto(file: Blob, maxSide = 640, quality = 0.6): Promise<StoredPhoto> {
  const canvas = await drawScaled(file, maxSide);
  const webp = await toBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp', contentType: 'image/webp' };
  const jpeg = await toBlob(canvas, 'image/jpeg', quality + 0.1);
  if (!jpeg) throw new Error('No se pudo codificar la foto');
  return { blob: jpeg, ext: 'jpg', contentType: 'image/jpeg' };
}
