/**
 * Downscales an image file to a JPEG and returns it as bare base64 (no data-URL
 * prefix). Honors EXIF orientation. Never upscales. Browser only.
 */
export async function fileToJpegBase64(
  file: Blob,
  maxSide = 1000,
  quality = 0.8,
): Promise<{ base64: string; mediaType: 'image/jpeg' }> {
  if (typeof document === 'undefined') {
    throw new Error('fileToJpegBase64 requires a browser environment');
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
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
}
