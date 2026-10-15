/**
 * @file apps/resident-pwa/src/features/surveys/surveys.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';

export async function getSurveys() {
  return await invokeFunction(Endpoints.SURVEYS_LIST);
}

export async function submitSurvey(surveyId, answers) {
  return await invokeFunction(Endpoints.SURVEYS_SUBMIT, { surveyId, answers });
}
