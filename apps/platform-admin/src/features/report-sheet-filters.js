import { descriptionOf } from './sheet-format.js';

export function filterReportCandidates(reports, {
  organization = '',
  unassigned = false,
  queryPredicate = () => true,
  search = ''
} = {}) {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  return reports.filter((report) => {
    if (organization && report.assigned_organization_id !== organization) return false;
    if (unassigned && !isUnassignedOrMisallocated(report)) return false;
    if (!queryPredicate(report)) return false;
    if (normalizedSearch) {
      const tracking = String(report.tracking_number ?? '').toLocaleLowerCase();
      const description = String(descriptionOf(report)).toLocaleLowerCase();
      if (!tracking.includes(normalizedSearch) && !description.includes(normalizedSearch)) return false;
    }
    return true;
  });
}

function isUnassignedOrMisallocated(report) {
  return report.assigned_organization_id === null || report.assigned_organization_id === undefined
    || (report.recommended_organization_id !== null && report.recommended_organization_id !== undefined
      && report.assigned_organization_id !== report.recommended_organization_id);
}
