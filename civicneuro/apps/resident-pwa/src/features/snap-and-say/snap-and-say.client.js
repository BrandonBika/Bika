/**
 * @file apps/resident-pwa/src/features/snap-and-say/snap-and-say.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';

export async function transcribeAudio(audioBlob) {
  return await invokeFunction(Endpoints.SNAP_TRANSCRIBE, { audio: audioBlob });
}

export async function analyzeReportIntent(text, photoMeta) {
  return await invokeFunction(Endpoints.SNAP_ANALYZE, { text, photoMeta });
}
