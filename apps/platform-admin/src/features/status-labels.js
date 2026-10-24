export const STATUS_LABELS = Object.freeze({
  'Needs Review': 'Under review',
  Dispatched: 'Assigned',
  Rejected: 'Closed'
});

export const EVENT_LABELS = Object.freeze({
  report_created: 'Report submitted',
  guest_report_claimed: 'Guest report claimed',
  status_and_assignment_changed: 'Status and organisation changed',
  status_changed: 'Status changed',
  assignment_changed: 'Organisation reassigned',
  reporter_changed: 'Reporter changed'
});

const CATEGORY_LABELS = Object.freeze({
  electricity: 'Electricity issues',
  water_sanitation: 'Water & sanitation',
  roads_traffic: 'Roads & traffic',
  safety_security: 'Safety & security',
  crime_safety: 'Safety & security',
  fire: 'Fire',
  medical: 'Medical',
  water: 'Water',
  other: 'Other',
  'safety & security': 'Safety & security'
});

export function getCategoryLabel(category) {
  if (category === null || category === undefined || String(category).trim() === '') {
    return 'Uncategorised';
  }
  const value = String(category).trim();
  const key = value.toLocaleLowerCase();
  if (Object.hasOwn(CATEGORY_LABELS, key)) return CATEGORY_LABELS[key];
  const prettified = value.replace(/_/g, ' ');
  return prettified.charAt(0).toLocaleUpperCase() + prettified.slice(1);
}

export function getStatusLabel(status) {
  return Object.hasOwn(STATUS_LABELS, status) ? STATUS_LABELS[status] : status;
}

export function getEventLabel(eventType) {
  return Object.hasOwn(EVENT_LABELS, eventType) ? EVENT_LABELS[eventType] : eventType;
}
