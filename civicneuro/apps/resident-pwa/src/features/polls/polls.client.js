/**
 * @file apps/resident-pwa/src/features/polls/polls.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';

export async function getPolls() {
  return await invokeFunction(Endpoints.POLLS_LIST);
}

export async function votePoll(pollId, optionId) {
  return await invokeFunction(Endpoints.POLLS_VOTE, { pollId, optionId });
}
