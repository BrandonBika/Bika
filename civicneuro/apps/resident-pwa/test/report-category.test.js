import test from 'node:test';
import assert from 'node:assert/strict';
import { isAwaitingAiClassification, reportCategoryLabel } from '../src/features/reports/report-category.js';

test('labels Needs Review reports without an AI classification as Awaiting review', () => {
  assert.equal(reportCategoryLabel({
    status: 'Needs Review',
    ai_category: null,
    user_selected_category: 'Roads'
  }), 'Awaiting review');
  assert.equal(reportCategoryLabel({
    status: 'Needs Review',
    ai_category: 'Unclear report'
  }), 'Awaiting review');
  assert.equal(isAwaitingAiClassification({
    status: 'Needs Review',
    ai_category: 'Unclear report'
  }), true);
  assert.equal(isAwaitingAiClassification({
    status: 'Needs Review',
    ai_category: 'Flooding'
  }), false);
});

test('preserves an available AI category and existing category fallbacks', () => {
  assert.equal(reportCategoryLabel({
    status: 'Needs Review',
    ai_category: 'Flooding',
    user_selected_category: 'Roads'
  }), 'Flooding');
  assert.equal(reportCategoryLabel({
    status: 'Pending Dispatch',
    user_selected_category: 'Roads'
  }), 'Roads');
  assert.equal(reportCategoryLabel({ status: 'Pending Dispatch' }), 'General');
});

test('labels legacy and current category values consistently', () => {
  const cases = [
    ['Fire', 'Fire'],
    ['fire', 'Fire'],
    ['Flooding', 'Flooding'],
    ['flooding', 'Flooding'],
    ['crime', 'Crime or safety emergency'],
    ['crime_safety', 'Crime or safety emergency'],
    ['sickness', 'Medical emergency'],
    ['medical', 'Medical emergency'],
    ['gbv', 'Gender-based violence'],
    ['gender_based_violence', 'Gender-based violence'],
    ['road accident', 'Road accident'],
    ['road_accident', 'Road accident'],
    ['water_sanitation', 'Water'],
    ['public_safety', 'Safety']
  ];
  for (const [category, expectedLabel] of cases) {
    assert.equal(reportCategoryLabel({ status: 'Pending Dispatch', ai_category: category }), expectedLabel);
  }
  assert.equal(reportCategoryLabel({ status: 'Pending Dispatch', category: 'sickness' }), 'Medical emergency');
  assert.equal(reportCategoryLabel({ status: 'Pending Dispatch', user_selected_category: 'Fire' }), 'Fire');
});

test('shows an explicit analysis state instead of Awaiting review while classification is running', () => {
  const report = {
    status: 'Needs Review',
    ai_category: 'Unclear report',
    review_reason: 'Analysis pending.'
  };
  assert.equal(reportCategoryLabel(report), 'Analysing report');
  assert.equal(isAwaitingAiClassification(report), true);
});

test('does not continue classifying explicit failures as pending', () => {
  assert.equal(isAwaitingAiClassification({
    status: 'Needs Review',
    ai_category: 'Unclear report',
    review_reason: 'Analysis failed: timeout: Gemini request timed out.'
  }), false);
});
