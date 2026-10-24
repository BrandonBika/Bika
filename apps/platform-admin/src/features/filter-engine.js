import { getCategoryLabel, getStatusLabel } from './status-labels.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PRIORITY_RANK = new Map([
  ['low', 1],
  ['medium', 2],
  ['high', 3],
  ['critical', 4]
]);

export const FIELDS = Object.freeze([
  { field: 'status', label: 'Status', type: 'enum' },
  { field: 'category', label: 'Category', type: 'enum' },
  { field: 'organisation', label: 'Organisation', type: 'organisation' },
  { field: 'priority', label: 'Priority', type: 'priority' },
  { field: 'created_at', label: 'Created date', type: 'date' },
  { field: 'days_open', label: 'Days open', type: 'numeric' },
  { field: 'location_name', label: 'Location name', type: 'text' },
  { field: 'description', label: 'Description', type: 'text' }
]);

const OPERATORS = Object.freeze({
  enum: ['is', 'is not'],
  priority: ['is', 'is not'],
  ordinal: ['is', 'is not', 'greater than', 'less than', 'at least', 'at most'],
  organisation: ['is', 'is not', 'is null', 'is not null'],
  date: ['is', 'is before', 'is after', 'is between'],
  numeric: ['=', '!=', '>', '>=', '<', '<=', 'between'],
  text: ['contains', 'starts with', 'is exactly']
});

const OPERATOR_LABELS = Object.freeze({
  is: 'is',
  'is not': 'is not',
  'greater than': 'is greater than',
  'less than': 'is less than',
  'at least': 'is at least',
  'at most': 'is at most',
  'is null': 'is null',
  'is not null': 'is not null',
  'is before': 'is before',
  'is after': 'is after',
  'is between': 'is between',
  '=': 'is',
  '!=': 'is not',
  '>': 'is greater than',
  '>=': 'is at least',
  '<': 'is less than',
  '<=': 'is at most',
  between: 'is between',
  contains: 'contains',
  'starts with': 'starts with',
  'is exactly': 'is exactly'
});

export function operatorsFor(fieldType) {
  return [...(OPERATORS[fieldType] ?? [])];
}

export function resolveFieldType(field, reports = []) {
  if (field !== 'priority') return FIELDS.find((item) => item.field === field)?.type ?? 'enum';
  const values = distinct(reports.map((report) => report.urgency).filter(hasValue));
  return values.every((value) => PRIORITY_RANK.has(String(value).trim().toLocaleLowerCase()))
    ? 'ordinal'
    : 'enum';
}

export function valueOptions(field, reports = [], ctx = {}) {
  let values = [];
  if (field === 'status') {
    values = reports.map((report) => report.status).filter(hasValue);
  } else if (field === 'category') {
    const getCategory = ctx.getCategory ?? ((report) => getCategoryLabel(
      report.category ?? report.issue_category ?? report.user_selected_category ?? report.ai_category
    ));
    values = reports.map(getCategory).filter(hasValue);
    if (reports.some((report) => !hasCategoryValue(report))) values.push('Uncategorised');
  } else if (field === 'organisation') {
    values = reports.map((report) => report.assigned_organization_id).filter(hasValue);
  } else if (field === 'priority') {
    values = reports.map((report) => report.urgency).filter(hasValue);
  }

  return distinct(values).sort((left, right) => String(left).localeCompare(String(right)))
    .map((value) => ({
      value: String(value),
      label: field === 'status'
        ? String(getStatusLabel(value))
        : field === 'organisation'
          ? String(ctx.organisations?.get?.(String(value)) ?? value)
          : String(value)
    }));
}

export function isCompleteCondition(condition) {
  if (!condition || condition.type !== 'condition' || !FIELDS.some((item) => item.field === condition.field)) {
    return false;
  }
  if (condition.field === 'organisation' && ['is null', 'is not null'].includes(condition.operator)) {
    return true;
  }
  if (!condition.operator) return false;
  if (condition.operator === 'between' || condition.operator === 'is between') {
    return Array.isArray(condition.value)
      ? hasValue(condition.value[0]) && hasValue(condition.value[1])
      : hasValue(condition.value) && hasValue(condition.valueTo);
  }
  return hasValue(condition.value);
}

export function countCompleteConditions(tree) {
  if (!tree) return 0;
  if (tree.type === 'condition') return isCompleteCondition(tree) ? 1 : 0;
  if (tree.type !== 'group' || !Array.isArray(tree.children)) return 0;
  return tree.children.reduce((total, child) => total + countCompleteConditions(child), 0);
}

export function cloneTree(tree) {
  if (!tree || typeof tree !== 'object') return tree;
  if (Array.isArray(tree)) return tree.map(cloneTree);
  return Object.fromEntries(Object.entries(tree).map(([key, value]) => [key, cloneTree(value)]));
}

export function compileTree(tree, ctx) {
  if (!ctx || !(ctx.now instanceof Date) || typeof ctx.getCategory !== 'function') {
    throw new TypeError('Filter context requires now: Date and getCategory(report).');
  }
  return (report) => evaluateNode(tree, report, ctx);
}

export function describeNode(node, ctx = {}) {
  if (!node) return 'Empty filter';
  if (node.type === 'group') {
    return `${node.negate ? 'NOT ' : ''}Group (${countCompleteConditions(node)} conditions)`;
  }
  const field = FIELDS.find((item) => item.field === node.field);
  if (!field) return 'Unknown condition';
  const operator = OPERATOR_LABELS[node.operator] ?? node.operator ?? 'is';
  if (node.field === 'organisation' && ['is null', 'is not null'].includes(node.operator)) {
    return `${node.negate ? 'NOT ' : ''}Organisation ${node.operator === 'is null' ? 'is Unassigned' : 'is Assigned'}`;
  }
  let value = '';
  if (!['is null', 'is not null'].includes(node.operator)) {
    const values = Array.isArray(node.value) ? node.value : [node.value ?? node.valueTo];
    value = values.map((raw) => {
      if (node.field === 'organisation') {
        return String(ctx.organisations?.get?.(String(raw)) ?? raw ?? '');
      }
      const option = valueOptions(node.field, ctx.reports ?? [], ctx)
        .find((candidate) => candidate.value === String(raw));
      return option?.label ?? String(raw ?? '');
    }).filter(Boolean).join(' and ');
  }
  return `${node.negate ? 'NOT ' : ''}${field.label} ${operator}${value ? ` ${value}` : ''}`;
}

function evaluateNode(node, report, ctx) {
  if (!node || typeof node !== 'object') return true;
  let result;
  if (node.type === 'group') {
    const matches = [];
    for (const child of node.children ?? []) {
      if (child.type === 'condition' && isCompleteCondition(child)) {
        matches.push(evaluateNode(child, report, ctx));
      } else if (child.type === 'group') {
        matches.push(evaluateNode(child, report, ctx));
      }
    }
    result = combine(matches, node.combinator);
  } else if (node.type === 'condition') {
    if (!isCompleteCondition(node)) return true;
    result = evaluateCondition(node, report, ctx);
  } else {
    return true;
  }
  return node.negate ? !result : result;
}

function combine(matches, combinator = 'AND') {
  if (!matches.length) return true;
  if (combinator === 'OR') return matches.some(Boolean);
  if (combinator === 'XOR') return matches.filter(Boolean).length === 1;
  return matches.every(Boolean);
}

function evaluateCondition(condition, report, ctx) {
  const { field, operator, value } = condition;
  if (field === 'status') return compareEnum(report.status, value, operator);
  if (field === 'category') return compareEnum(ctx.getCategory(report), value, operator);
  if (field === 'organisation') {
    const assigned = hasValue(report.assigned_organization_id);
    if (operator === 'is null') return !assigned;
    if (operator === 'is not null') return assigned;
    return compareEnum(report.assigned_organization_id, value, operator);
  }
  if (field === 'priority') return comparePriority(report.urgency, value, operator);
  if (field === 'created_at') return compareDate(report.created_at, condition, operator);
  if (field === 'days_open') return compareNumber(daysOpen(report.created_at, ctx.now), condition, operator);
  if (field === 'location_name') return compareText(report.location_name, value, operator);
  if (field === 'description') {
    return compareText(
      report.description_english || report.description_original || report.description,
      value,
      operator
    );
  }
  return false;
}

function compareEnum(actual, expected, operator) {
  const equal = String(actual ?? '') === String(expected);
  return operator === 'is not' ? !equal : operator === 'is' && equal;
}

function comparePriority(actual, expected, operator) {
  if (['is', 'is not'].includes(operator)) return compareEnum(actual, expected, operator);
  const actualRank = PRIORITY_RANK.get(String(actual ?? '').trim().toLocaleLowerCase());
  const expectedRank = PRIORITY_RANK.get(String(expected ?? '').trim().toLocaleLowerCase());
  if (actualRank === undefined || expectedRank === undefined) return false;
  if (operator === 'greater than') return actualRank > expectedRank;
  if (operator === 'less than') return actualRank < expectedRank;
  if (operator === 'at least') return actualRank >= expectedRank;
  if (operator === 'at most') return actualRank <= expectedRank;
  return false;
}

function compareDate(actual, condition, operator) {
  const reportDay = calendarDay(actual);
  const firstValue = Array.isArray(condition.value) ? condition.value[0] : condition.value;
  const firstDay = calendarDay(firstValue);
  const secondValue = Array.isArray(condition.value) ? condition.value[1] : condition.valueTo;
  const secondDay = calendarDay(secondValue);
  if (!reportDay || !firstDay) return false;
  if (operator === 'is') return reportDay === firstDay;
  if (operator === 'is before') return reportDay < firstDay;
  if (operator === 'is after') return reportDay > firstDay;
  return operator === 'is between' && secondDay !== null
    && reportDay >= firstDay && reportDay <= secondDay;
}

function compareNumber(actual, condition, operator) {
  const firstValue = Array.isArray(condition.value) ? condition.value[0] : condition.value;
  const target = Number(firstValue);
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return false;
  const rangeEnd = Number(Array.isArray(condition.value) ? condition.value[1] : condition.valueTo);
  if (operator === '=') return actual === target;
  if (operator === '!=') return actual !== target;
  if (operator === '>') return actual > target;
  if (operator === '>=') return actual >= target;
  if (operator === '<') return actual < target;
  if (operator === '<=') return actual <= target;
  return operator === 'between' && Number.isFinite(rangeEnd)
    && actual >= target && actual <= rangeEnd;
}

function compareText(actual, expected, operator) {
  if (actual === null || actual === undefined) return false;
  const text = String(actual).toLocaleLowerCase();
  const search = String(expected).toLocaleLowerCase();
  if (operator === 'contains') return text.includes(search);
  if (operator === 'starts with') return text.startsWith(search);
  return operator === 'is exactly' && text === search;
}

function daysOpen(createdAt, now) {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return NaN;
  return Math.floor((now.getTime() - created) / DAY_MS);
}

function calendarDay(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  return typeof value === 'number' ? Number.isFinite(value) : String(value).trim() !== '';
}

function distinct(values) {
  return [...new Set(values)];
}

function hasCategoryValue(report) {
  return hasValue(
    report.category ?? report.issue_category ?? report.user_selected_category ?? report.ai_category
  );
}
