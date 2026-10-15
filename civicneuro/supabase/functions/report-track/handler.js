import { handleReportTracking } from '../_shared/report-tracking.js';

export function handleReportTrack(request, context = {}) {
  return handleReportTracking(request, context);
}
