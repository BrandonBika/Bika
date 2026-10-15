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
  ])
};

export function validateEvidenceFile(file, kind) {
  if (!file) return null;
  if (file.size > MAX_EVIDENCE_SIZE) return 'This file is too large (max 25 MB)';
  if (!SUPPORTED_MIME_TYPES[kind]?.has(file.type.toLowerCase())) {
    return "This file type isn't supported";
  }
  return null;
}
