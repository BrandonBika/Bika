/**
 * @file packages/schemas/src/beacon.js
 * Schemas for Beacon circle members, requests, sharing sessions.
 */
import { validate } from './validate.js';

export const beaconShareSchema = {
  recipientId: { type: 'string', required: true },
  durationMinutes: { type: 'number', required: true, validator: (v) => v > 0 && v <= 720 },
  reason: { type: 'string', required: false }
};

export function validateBeaconShare(data) {
  return validate(data, beaconShareSchema);
}
