/**
 * @file packages/media-client/src/compress-image.js
 */
import { stripExif } from './strip-metadata.js';
import { MAX_IMAGE_SIZE } from './limits.js';

export async function compressImage(file, {
  maxWidth = 1600,
  quality = 0.8,
  maxBytes = MAX_IMAGE_SIZE
} = {}) {
  if (file.size <= maxBytes) return await stripExif(file);
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    throw new Error('This photo is too large to process on this device. Choose a smaller photo.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const loadedImage = new Image();
      loadedImage.onload = () => resolve(loadedImage);
      loadedImage.onerror = () => reject(new Error('This photo could not be opened for resizing. Choose a different photo.'));
      loadedImage.src = objectUrl;
    });
    let scale = Math.min(1, maxWidth / image.width, maxWidth / image.height);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Photo resizing is unavailable on this device.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const compressed = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', Math.max(0.4, quality - attempt * 0.08));
      });
      if (compressed && compressed.size <= maxBytes) return compressed;
      scale *= 0.75;
    }
    throw new Error('This photo could not be reduced below 8 MiB. Choose a smaller photo.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
