/**
 * @file packages/schemas/src/surveys.js
 */
import { validate } from './validate.js';

export const surveyResponseSchema = {
  surveyId: { type: 'string', required: true },
  answers: { type: 'array', required: true }
};

export function validateSurveyResponse(data) {
  return validate(data, surveyResponseSchema);
}
