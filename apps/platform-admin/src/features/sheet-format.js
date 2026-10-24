const DAY_MS = 24 * 60 * 60 * 1000;

const PRIORITIES = new Map([
  ['low', { label: 'Low', level: 'low', rank: 1 }],
  ['medium', { label: 'Medium', level: 'medium', rank: 2 }],
  ['high', { label: 'High', level: 'high', rank: 3 }],
  ['critical', { label: 'Critical', level: 'critical', rank: 4 }]
]);

export function priorityBadge(urgency) {
  const priority = typeof urgency === 'string'
    ? PRIORITIES.get(urgency.trim().toLocaleLowerCase())
    : null;
  return priority
    ? { label: priority.label, level: priority.level }
    : {
      label: urgency === null || urgency === undefined || String(urgency).trim() === ''
        ? '–'
        : String(urgency).trim(),
      level: 'unknown'
    };
}

export function priorityRank(urgency) {
  if (typeof urgency !== 'string') return 0;
  return PRIORITIES.get(urgency.trim().toLocaleLowerCase())?.rank ?? 0;
}

export function truncateText(text, max) {
  if (text === null || text === undefined) return '';
  const normalized = String(text).trim().replace(/\s+/g, ' ');
  if (!Number.isFinite(max) || max < 0 || normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.floor(max)).trimEnd()}…`;
}

export function descriptionOf(report) {
  return report?.description_english
    || report?.description_original
    || report?.description
    || '';
}

export function descriptionExcerpt(report, max = 80) {
  return truncateText(descriptionOf(report), max) || '–';
}

export function reporterTypeOf(reporter) {
  if (reporter?.kind === 'resident') return 'Resident';
  if (reporter?.kind === 'guest') return 'Guest';
  return 'Anonymous';
}

export function ageLabel(createdAt, now) {
  const created = Date.parse(createdAt);
  const current = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(created) || !Number.isFinite(current) || created > current) return '';

  const days = Math.floor((current - created) / DAY_MS);
  return days === 0 ? '<1d' : `${days}d`;
}

export function relativeTime(updatedAt, now) {
  const updated = Date.parse(updatedAt);
  const current = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(updated) || !Number.isFinite(current) || updated > current) return '';

  const elapsed = current - updated;
  if (elapsed < 60 * 1000) return 'just now';
  if (elapsed < 60 * 60 * 1000) return `${Math.floor(elapsed / (60 * 1000))} min ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / (60 * 60 * 1000))} h ago`;
  if (elapsed <= 30 * DAY_MS) {
    const days = Math.floor(elapsed / DAY_MS);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }
  return new Date(updated).toISOString().slice(0, 10);
}

export function formatCoordinate(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return Number(number.toFixed(4)).toFixed(4);
}

export function evidenceCountMap(rows) {
  const counts = new Map();
  for (const row of rows ?? []) {
    if (row?.report_id === null || row?.report_id === undefined) continue;
    counts.set(row.report_id, (counts.get(row.report_id) ?? 0) + 1);
  }
  return counts;
}
