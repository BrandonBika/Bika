/**
 * @file packages/schemas/src/chat.js
 */
import { validate } from './validate.js';

export const chatMessageSchema = {
  sessionId: { type: 'string', required: true },
  text: { type: 'string', required: true, validator: (v) => typeof v === 'string' && v.trim().length > 0 }
};

export function validateChatMessage(data) {
  return validate(data, chatMessageSchema);
}
