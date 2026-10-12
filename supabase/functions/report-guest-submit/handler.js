import { handleReportSubmission } from '../_shared/report-submission.js';

export function handleReportGuestSubmit(request, context = {}) {
  return handleReportSubmission(request, context, true);
}
