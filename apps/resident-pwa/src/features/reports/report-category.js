export function reportCategoryLabel(row) {
  const aiCategory = String(row.ai_category || '').trim();
  const isNeedsReview = String(row.status || '').toLowerCase() === 'needs review';
  if (isNeedsReview && (!aiCategory || aiCategory.toLowerCase() === 'unclear report')) {
    return 'Awaiting review';
  }
  return aiCategory || row.user_selected_category || row.category || 'General';
}
