import { ReportCategoryDefinitions } from '../../../../../packages/config/src/enums.js';

const LEGACY_CATEGORY_ALIASES = new Map([
  ['crime', 'crime_safety'],
  ['sickness', 'medical'],
  ['gbv', 'gender_based_violence'],
  ['water_sanitation', 'water'],
  ['public_safety', 'safety']
]);

export function isAwaitingAiClassification(row) {
  const aiCategory = String(row.ai_category || '').trim();
  const isNeedsReview = String(row.status || '').toLowerCase() === 'needs review';
  const reviewReason = String(row.review_reason || '');
  if (reviewReason && reviewReason !== 'Analysis pending.') return false;
  return isNeedsReview && (!aiCategory || aiCategory.toLowerCase() === 'unclear report');
}

export function reportCategoryLabel(row) {
  const aiCategory = String(row.ai_category || '').trim();
  if (String(row.review_reason || '') === 'Analysis pending.') return 'Analysing report';
  if (isAwaitingAiClassification(row)) return 'Awaiting review';
  const category = aiCategory
    || String(row.user_selected_category || '').trim()
    || String(row.category || '').trim();
  const normalizedCategory = category.toLowerCase();
  const canonicalCategory = LEGACY_CATEGORY_ALIASES.get(normalizedCategory) || normalizedCategory;
  const definition = ReportCategoryDefinitions.find(({ value, label }) =>
    value.toLowerCase() === canonicalCategory || label.toLowerCase() === normalizedCategory
  );
  return definition?.label || category || 'General';
}
