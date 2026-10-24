import { handleReportSubmit } from '../report-submit/handler.js';

export function handleReportsCreate(request, context = {}) {
  return handleReportSubmit(request, context);
}