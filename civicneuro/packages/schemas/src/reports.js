/**
 * @file packages/schemas/src/reports.js
 * Schemas for report creation, AI drafts, guest reports, tracking.
 */
import { validate } from './validate.js';

export const reportCreateSchema = {
  title: { type: 'string', required: true },
  description: { type: 'string', required: true },
  category: { type: 'string', required: true },
  latitude: { type: 'number', required: true, validator: (v) => v >= -35 && v <= -22, message: 'Coordinates must be within South Africa' },
  longitude: { type: 'number', required: true, validator: (v) => v >= 16 && v <= 33, message: 'Coordinates must be within South Africa' },
  address: { type: 'string', required: false },
  mediaIds: { type: 'array', required: false },
  isAnonymous: { type: 'boolean', required: false }
};

export function validateReportCreate(data) {
  return validate(data, reportCreateSchema);
}

export const snapAndSayDraftSchema = {
  category: { type: 'string', required: true },
  description: { type: 'string', required: true },
  keywords: { type: 'array', required: false },
  urgency: { type: 'string', required: false },
  followUpQuestion: { type: 'string', required: false },
  isEmergency: { type: 'boolean', required: false }
};

export function validateSnapAndSayDraft(data) {
  return validate(data, snapAndSayDraftSchema);
}
