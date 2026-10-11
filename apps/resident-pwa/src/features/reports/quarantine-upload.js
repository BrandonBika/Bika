/**
 * @file apps/resident-pwa/src/features/reports/quarantine-upload.js
 */
import { uploadToQuarantine } from '@civicneuro/media-client';

export async function uploadEvidence(file, onProgress) {
  return await uploadToQuarantine(file, onProgress);
}
