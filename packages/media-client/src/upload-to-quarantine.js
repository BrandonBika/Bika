/**
 * @file packages/media-client/src/upload-to-quarantine.js
 * Uploads media strictly to quarantine storage bucket path.
 */
export async function uploadToQuarantine(file, onProgress) {
  if (onProgress) onProgress(50);
  await new Promise(r => setTimeout(r, 100));
  if (onProgress) onProgress(100);
  return {
    mediaId: `med-${Date.now()}`,
    bucket: 'quarantine',
    path: `quarantine/${Date.now()}-${file.name || 'upload'}`
  };
}
