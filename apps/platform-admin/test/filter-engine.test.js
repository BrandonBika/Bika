import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileTree,
  cloneTree,
  countCompleteConditions,
  describeNode,
  isCompleteCondition,
  operatorsFor,
  resolveFieldType,
  valueOptions
} from '../src/features/filter-engine.js';
import { getCategoryLabel } from '../src/features/status-labels.js';

const now = new Date('2026-10-24T12:00:00.000Z');
const ctx = {
  now,
  getCategory(report) {
    return getCategoryLabel(
      report.category ?? report.issue_category ?? report.user_selected_category ?? report.ai_category
    );
  },
  organisations: new Map([['org-1', 'Water Department']])
};

const condition = (field, operator, value, extra = {}) => ({
  type: 'condition',
  field,
  operator,
  value,
  negate: false,
  ...extra
});

const group = (children, combinator = 'AND', extra = {}) => ({
  type: 'group',
  combinator,
  negate: false,
  children,
  ...extra
});

const matches = (tree, report) => compileTree(tree, ctx)(report);

test('AND, OR, XOR, NOT, and nested groups evaluate correctly', () => {
  const open = condition('status', 'is', 'Open');
  const urgent = condition('priority', 'is', 'High');
  const report = { status: 'Open', urgency: 'High' };
  assert.equal(matches(group([open, urgent]), report), true);
  assert.equal(matches(group([open, condition('status', 'is', 'Closed')], 'OR'), report), true);
  assert.equal(matches(group([open, urgent], 'XOR'), report), false);
  assert.equal(matches({ ...open, negate: true }, report), false);
  assert.equal(matches(group([open, urgent], 'OR', { negate: true }), report), false);
  assert.equal(matches(group([open, group([urgent], 'XOR')]), report), true);
});

test('unset conditions are skipped in groups and XOR; empty trees match all', () => {
  const unset = condition('status', 'is', '');
  assert.equal(isCompleteCondition(unset), false);
  assert.equal(countCompleteConditions(group([unset])), 0);
  assert.equal(matches(group([unset]), {}), true);
  assert.equal(matches(group([unset, condition('status', 'is', 'Open')], 'XOR'), { status: 'Open' }), true);
  assert.equal(matches(group([group([]), condition('status', 'is', 'Open')], 'XOR'), { status: 'Open' }), false);
  assert.equal(matches(group([]), {}), true);
  assert.equal(matches(null, {}), true);
});

test('enum operators match and negate status/category values', () => {
  assert.deepEqual(operatorsFor('enum'), ['is', 'is not']);
  const report = { status: 'Closed', category: 'water_sanitation' };
  assert.equal(matches(group([condition('status', 'is', 'Closed')]), report), true);
  assert.equal(matches(group([condition('status', 'is not', 'Open')]), report), true);
  assert.equal(matches(group([condition('category', 'is', 'Water & sanitation')]), report), true);
});

test('priority uses enum operators for mixed values and ordinal rank when values are standard', () => {
  assert.deepEqual(operatorsFor('ordinal'), [
    'is', 'is not', 'greater than', 'less than', 'at least', 'at most'
  ]);
  assert.equal(resolveFieldType('priority', [{ urgency: 'low' }, { urgency: 'urgent' }]), 'enum');
  const reports = [{ urgency: 'Low' }, { urgency: 'HIGH' }, { urgency: 'Critical' }];
  assert.equal(resolveFieldType('priority', reports), 'ordinal');
  const report = { urgency: 'Medium' };
  assert.equal(matches(group([condition('priority', 'is not', 'Low')]), report), true);
  assert.equal(matches(group([condition('priority', 'greater than', 'Low')]), report), true);
  assert.equal(matches(group([condition('priority', 'less than', 'High')]), report), true);
  assert.equal(matches(group([condition('priority', 'at least', 'Medium')]), report), true);
  assert.equal(matches(group([condition('priority', 'at most', 'Medium')]), report), true);
  assert.equal(valueOptions('priority', reports).length, 3);
  assert.deepEqual(operatorsFor(resolveFieldType('priority', [{ urgency: 'Low' }, { urgency: 'urgent' }])), ['is', 'is not']);
});

test('date operators compare calendar days and support before, after, and between', () => {
  assert.deepEqual(operatorsFor('date'), ['is', 'is before', 'is after', 'is between']);
  const report = { created_at: '2026-10-20T23:59:59.000Z' };
  assert.equal(matches(group([condition('created_at', 'is', '2026-10-20')]), report), true);
  assert.equal(matches(group([condition('created_at', 'is before', '2026-10-21')]), report), true);
  assert.equal(matches(group([condition('created_at', 'is after', '2026-10-19')]), report), true);
  assert.equal(matches(group([condition('created_at', 'is between', ['2026-10-19', '2026-10-21'])]), report), true);
  assert.equal(matches(group([condition('created_at', 'is between', ['2026-10-21', '2026-10-22'])]), report), false);
});

test('numeric operators include comparisons and between', () => {
  assert.deepEqual(operatorsFor('numeric'), ['=', '!=', '>', '>=', '<', '<=', 'between']);
  const report = { created_at: '2026-10-20T12:00:00.000Z' };
  for (const [operator, value, expected] of [
    ['=', '4', true], ['!=', '3', true], ['>', '3', true], ['>=', '4', true],
    ['<', '5', true], ['<=', '4', true], ['between', ['3', '5'], true]
  ]) {
    assert.equal(matches(group([condition('days_open', operator, value)]), report), expected);
  }
});

test('text operators are case-insensitive and description uses the documented fallback', () => {
  assert.deepEqual(operatorsFor('text'), ['contains', 'starts with', 'is exactly']);
  const report = {
    location_name: 'Durban North',
    description_original: 'Broken water pipe'
  };
  assert.equal(matches(group([condition('location_name', 'contains', 'NORTH')]), report), true);
  assert.equal(matches(group([condition('location_name', 'starts with', 'durban')]), report), true);
  assert.equal(matches(group([condition('description', 'is exactly', 'BROKEN WATER PIPE')]), report), true);
  assert.equal(matches(group([condition('description', 'contains', 'water')]), {
    description_english: 'Pipe leak', description_original: 'water leak'
  }), false);
});

test('organisation null checks and ID matching use assigned_organization_id', () => {
  assert.deepEqual(operatorsFor('organisation'), ['is', 'is not', 'is null', 'is not null']);
  assert.equal(matches(group([condition('organisation', 'is null', undefined)]), {
    assigned_organization_id: null
  }), true);
  assert.equal(matches(group([condition('organisation', 'is not null', undefined)]), {
    assigned_organization_id: 'org-1'
  }), true);
  assert.equal(matches(group([condition('organisation', 'is', 'org-1')]), {
    assigned_organization_id: 'org-1'
  }), true);
  assert.deepEqual(valueOptions('organisation', [{ assigned_organization_id: 'org-1' }], ctx), [{
    value: 'org-1',
    label: 'Water Department'
  }]);
  assert.equal(describeNode(condition('organisation', 'is', 'org-1'), {
    ...ctx, reports: []
  }), 'Organisation is Water Department');
});

test('invalid dates never match, and days_open uses ctx.now in whole days', () => {
  assert.equal(matches(group([condition('created_at', 'is', '2026-10-20')]), {
    created_at: 'not a date'
  }), false);
  assert.equal(matches(group([condition('days_open', '=', '4')]), {
    created_at: '2026-10-20T11:00:00.000Z'
  }), true);
  assert.equal(matches(group([condition('days_open', '=', 'NaN')]), {
    created_at: '2026-10-20'
  }), false);
  assert.equal(matches(group([condition('created_at', 'is', '2026-10-20')]), {}), false);
});

test('category fallback chain and uncategorised options are available', () => {
  const reports = [
    { category: null, issue_category: 'roads_traffic' },
    { user_selected_category: 'water' },
    { ai_category: 'fire' },
    {}
  ];
  const options = valueOptions('category', reports, ctx).map((option) => option.value);
  assert.deepEqual(options, ['Fire', 'Roads & traffic', 'Uncategorised', 'Water']);
  assert.equal(matches(group([condition('category', 'is', 'Roads & traffic')]), reports[0]), true);
  assert.equal(matches(group([condition('category', 'is', 'Uncategorised')]), reports[3]), true);
});

test('cloneTree copies nested filter nodes without sharing their children', () => {
  const original = group([group([condition('status', 'is', 'Open')])]);
  const cloned = cloneTree(original);
  cloned.children[0].children[0].value = 'Closed';
  assert.equal(original.children[0].children[0].value, 'Open');
});
