const HISTORICAL_STATUSES = new Set(['Resolved', 'Rejected', 'Duplicate']);

export function reportsForTab(reports, tab) {
  return (reports || []).filter((report) => (
    tab === 'historical'
      ? HISTORICAL_STATUSES.has(report.status)
      : !HISTORICAL_STATUSES.has(report.status)
  ));
}
