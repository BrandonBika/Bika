import { handleReportSubmission } from '../_shared/report-submission.js';

export function handleReportSubmit(request, context = {}) {
  return handleReportSubmission(request, context, false);
}
