import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidenceFile } from '../src/features/reports/evidence-validation.js';

const photoTypes = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
];
const videoTypes = [
  'video/3gpp',
  'video/mp4',
  'video/quicktime',
  'video/webm'
];

test('accepts each photo MIME type allowed by report submission', () => {
  for (const type of photoTypes) {
    assert.equal(validateEvidenceFile({ type, size: 1 }, 'photo'), null, type);
  }
});

test('accepts each video MIME type allowed by report submission', () => {
  for (const type of videoTypes) {
    assert.equal(validateEvidenceFile({ type, size: 1 }, 'video'), null, type);
  }
});

test('rejects unsupported photo and video MIME types with a friendly message', () => {
  assert.equal(
    validateEvidenceFile({ type: 'image/gif', size: 1 }, 'photo'),
    "This file type isn't supported"
  );
  assert.equal(
    validateEvidenceFile({ type: 'video/x-msvideo', size: 1 }, 'video'),
    "This file type isn't supported"
  );
});

test('rejects evidence larger than 25 MiB and accepts the exact limit', () => {
  const limit = 25 * 1024 * 1024;
  assert.equal(validateEvidenceFile({ type: 'image/jpeg', size: limit }, 'photo'), null);
  assert.equal(
    validateEvidenceFile({ type: 'image/jpeg', size: limit + 1 }, 'photo'),
    'This file is too large (max 25 MB)'
  );
});

test('enforces the Snap & Say photo and audio server limits with friendly messages', () => {
  const imageLimit = 8 * 1024 * 1024;
  const audioLimit = 5 * 1024 * 1024;
  assert.equal(validateEvidenceFile({ type: 'image/jpeg', size: imageLimit }, 'snap-photo'), null);
  assert.match(
    validateEvidenceFile({ type: 'image/jpeg', size: imageLimit + 1 }, 'snap-photo'),
    /below 8 MiB/
  );
  assert.equal(validateEvidenceFile({ type: 'audio/webm;codecs=opus', size: audioLimit }, 'snap-audio'), null);
  assert.match(
    validateEvidenceFile({ type: 'audio/webm', size: audioLimit + 1 }, 'snap-audio'),
    /maximum 5 MiB/
  );
});
