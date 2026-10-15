/**
 * @file packages/media-client/src/compress-image.js
 */
import { stripExif } from './strip-metadata.js';

export async function compressImage(file, { maxWidth = 1600, quality = 0.8 } = {}) {
  return await stripExif(file);
}
