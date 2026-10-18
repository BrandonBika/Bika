import { MAX_AUDIO_SIZE, MAX_IMAGE_SIZE } from '../../../../../packages/media-client/src/limits.js';

const MAX_EVIDENCE_SIZE = 25 * 1024 * 1024;

const SUPPORTED_MIME_TYPES = {
  photo: new Set([
    'image/heic',
    'image/heif',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
  ]),
  video: new Set([
    'video/3gpp',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]),
  audio: new Set([
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/aac',
    'audio/ogg',
    'audio/webm',
    'audio/wav',
    'audio/x-wav'
  ])
};

export function validateEvidenceFile(file, kind) {
  if (!file) return null;
  if (kind === 'snap-photo' && file.size > MAX_IMAGE_SIZE) return 'This photo could not be reduced below 8 MiB. Choose a smaller photo.';
  if (kind === 'snap-audio' && file.size > MAX_AUDIO_SIZE) return 'This recording is too large (maximum 5 MiB). Please record a shorter clip.';
  if (file.size > MAX_EVIDENCE_SIZE) return 'This file is too large (max 25 MB)';
  const mime = String(file.type || '').split(';', 1)[0].toLowerCase();
  const supportedKind = kind === 'snap-photo' ? 'photo' : kind === 'snap-audio' ? 'audio' : kind;
  if (!SUPPORTED_MIME_TYPES[supportedKind]?.has(mime)) {
    return "This file type isn't supported";
  }
  return null;
}
