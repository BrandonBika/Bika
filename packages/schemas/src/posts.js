/**
 * @file packages/schemas/src/posts.js
 */
import { validate } from './validate.js';

export const postVoteSchema = {
  pollId: { type: 'string', required: true },
  optionId: { type: 'string', required: true }
};

export function validatePostVote(data) {
  return validate(data, postVoteSchema);
}
