export function isAwaitingAiClassification(row) {
  const aiCategory = String(row.ai_category || '').trim();
  const isNeedsReview = String(row.status || '').toLowerCase() === 'needs review';
  return isNeedsReview && (!aiCategory || aiCategory.toLowerCase() === 'unclear report');
}

export function reportCategoryLabel(row) {
  const aiCategory = String(row.ai_category || '').trim();
  if (isAwaitingAiClassification(row)) return 'Awaiting review';
  return aiCategory || row.user_selected_category || row.category || 'General';
}
