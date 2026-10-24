import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ageLabel,
  descriptionOf,
  evidenceCountMap,
  formatCoordinate,
  priorityBadge,
  priorityRank,
  relativeTime,
  truncateText
} from '../src/features/sheet-format.js';

test('priorityBadge recognizes the supported priorities case-insensitively', () => {
  assert.deepEqual(priorityBadge(' low '), { label: 'Low', level: 'low' });
  assert.deepEqual(priorityBadge('MEDIUM'), { label: 'Medium', level: 'medium' });
  assert.deepEqual(priorityBadge('High'), { label: 'High', level: 'high' });
  assert.deepEqual(priorityBadge('critical'), { label: 'Critical', level: 'critical' });
  assert.deepEqual(priorityBadge(null), { label: 'Not set', level: 'unknown' });
  assert.deepEqual(priorityBadge('   '), { label: 'Not set', level: 'unknown' });
  assert.deepEqual(priorityBadge('urgent'), { label: 'Not set', level: 'unknown' });
});

test('priorityRank orders recognized values and puts unknown values last', () => {
  assert.deepEqual(
    ['unknown', 'Low', 'Medium', 'High', 'Critical'].map(priorityRank),
    [0, 1, 2, 3, 4]
  );
  assert.equal(priorityRank(null), 0);
});

test('truncateText trims and collapses whitespace, including cut boundaries', () => {
  assert.equal(truncateText('  Some\n   detail  ', 40), 'Some detail');
  assert.equal(truncateText('  a long description  ', 8), 'a long d…');
  assert.equal(truncateText(null, 8), '');
  assert.equal(truncateText('unchanged', 0), '…');
  assert.equal(truncateText('unchanged', Number.NaN), 'unchanged');
});

test('descriptionOf uses translated, original, then fallback description', () => {
  assert.equal(descriptionOf({
    description_english: 'English',
    description_original: 'Original',
    description: 'Fallback'
  }), 'English');
  assert.equal(descriptionOf({ description_original: 'Original', description: 'Fallback' }), 'Original');
  assert.equal(descriptionOf({ description: 'Fallback' }), 'Fallback');
  assert.equal(descriptionOf(null), '');
});

test('ageLabel formats elapsed days, weeks, and months and rejects invalid dates', () => {
  const now = new Date('2026-10-24T12:00:00.000Z');
  assert.equal(ageLabel('2026-10-24T11:00:00.000Z', now), 'Today');
  assert.equal(ageLabel('2026-10-23T12:00:00.000Z', now), '1 day');
  assert.equal(ageLabel('2026-10-19T12:00:00.000Z', now), '5 days');
  assert.equal(ageLabel('2026-10-10T12:00:00.000Z', now), '2 weeks');
  assert.equal(ageLabel('2026-10-03T12:00:00.000Z', now), '3 weeks');
  assert.equal(ageLabel('2026-09-24T12:00:00.000Z', now), '1 month');
  assert.equal(ageLabel('2026-08-25T12:00:00.000Z', now), '2 months');
  assert.equal(ageLabel('not a date', now), '');
  assert.equal(ageLabel('2026-10-25T12:00:00.000Z', now), '');
  assert.equal(ageLabel(null, now), '');
});

test('relativeTime formats minute, hour, day and old date boundaries', () => {
  const now = new Date('2026-10-24T12:00:00.000Z');
  assert.equal(relativeTime('2026-10-24T11:59:30.000Z', now), 'just now');
  assert.equal(relativeTime('2026-10-24T11:55:00.000Z', now), '5 min ago');
  assert.equal(relativeTime('2026-10-24T11:00:00.000Z', now), '1 h ago');
  assert.equal(relativeTime('2026-10-24T09:00:00.000Z', now), '3 h ago');
  assert.equal(relativeTime('2026-10-23T12:00:00.000Z', now), '1 day ago');
  assert.equal(relativeTime('2026-10-22T12:00:00.000Z', now), '2 days ago');
  assert.equal(relativeTime('2026-09-24T12:00:00.000Z', now), '30 days ago');
  assert.equal(relativeTime('2026-09-23T11:59:59.000Z', now), '2026-09-23');
  assert.equal(relativeTime('invalid', now), '');
  assert.equal(relativeTime('2026-10-25T12:00:00.000Z', now), '');
  assert.equal(relativeTime(null, now), '');
});

test('formatCoordinate rounds to four decimals and rejects non-finite or missing values', () => {
  assert.equal(formatCoordinate(-1.23456), '-1.2346');
  assert.equal(formatCoordinate(2), '2.0000');
  assert.equal(formatCoordinate('-0.00001'), '0.0000');
  assert.equal(formatCoordinate(null), '');
  assert.equal(formatCoordinate(''), '');
  assert.equal(formatCoordinate(Number.NaN), '');
  assert.equal(formatCoordinate(Number.POSITIVE_INFINITY), '');
});

test('evidenceCountMap counts records by report and skips missing IDs', () => {
  assert.deepEqual([...evidenceCountMap([
    { report_id: 'report-1' },
    { report_id: 'report-2' },
    { report_id: 'report-1' },
    {},
    null
  ])], [['report-1', 2], ['report-2', 1]]);
  assert.deepEqual([...evidenceCountMap(null)], []);
});
