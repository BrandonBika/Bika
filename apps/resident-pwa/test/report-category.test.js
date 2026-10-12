import test from 'node:test';
import assert from 'node:assert/strict';
import { reportCategoryLabel } from '../src/features/reports/report-category.js';

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
