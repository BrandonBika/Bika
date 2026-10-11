/**
 * @file apps/resident-pwa/src/features/reports/reports.client.js
 * Client adapter connecting resident UI actions to reportsStore and backend endpoints.
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';
import { enqueueReport } from '@civicneuro/offline-queue';
import {
  getAllReports,
  getReportById,
  addReportMessage,
  addInformationToReport,
  escalateReportById,
  withdrawReportById,
  setReportSatisfaction,
  reopenReportById,
  markReportAsRead,
  addQueuedReport
} from './reports.store.js';

export async function submitReport(payload, isGuest = false) {
  if (!navigator.onLine) {
    await enqueueReport(payload);
    addQueuedReport(payload);
    return { queued: true, message: 'Report saved offline and will sync once connected.' };
  }
  const endpoint = isGuest ? Endpoints.REPORT_GUEST_SUBMIT : Endpoints.REPORT_SUBMIT;
  return await invokeFunction(endpoint, payload);
}

export async function listMyReports() {
  return { reports: getAllReports() };
}

export async function getReport(idOrRef) {
  const rep = getReportById(idOrRef);
  if (rep) return rep;
  return await invokeFunction(Endpoints.REPORT_GET, { id: idOrRef, referenceNumber: idOrRef });
}

export async function trackGuestReport(referenceNumber, contact) {
  return await invokeFunction(Endpoints.REPORT_TRACK, { referenceNumber, contact });
}

export async function escalateReport(reportId, reason = 'Escalated by resident') {
  const updated = escalateReportById(reportId, reason);
  try {
    await invokeFunction(Endpoints.REPORT_ESCALATE, { reportId, reason });
  } catch (_) {
    // Keep optimistic update in store
  }
  return updated;
}

export async function withdrawReport(reportId, reason = 'Resident requested withdrawal') {
  const updated = withdrawReportById(reportId, reason);
  try {
    await invokeFunction(Endpoints.REPORT_WITHDRAW, { reportId, reason });
  } catch (_) {
    // Keep optimistic update in store
  }
  return updated;
}

export async function submitSatisfaction(reportId, ratingOrBool, comment = '') {
  const isSatisfied = typeof ratingOrBool === 'boolean' ? ratingOrBool : ratingOrBool >= 4;
  const updated = setReportSatisfaction(reportId, isSatisfied);
  try {
    await invokeFunction(Endpoints.REPORT_SATISFACTION, { reportId, rating: isSatisfied ? 5 : 1, comment });
  } catch (_) {
    // Keep store updated
  }
  return updated;
}

export async function reopenReport(reportId, reason) {
  const updated = reopenReportById(reportId, reason);
  try {
    await invokeFunction(Endpoints.REPORT_REOPEN, { reportId, reason });
  } catch (_) {
    // Keep store updated
  }
  return updated;
}

export async function addReportInfo(reportId, details, evidence = []) {
  return addInformationToReport(reportId, details, evidence);
}

export async function sendChatMessage(reportId, text, sender = 'resident') {
  return addReportMessage(reportId, text, sender);
}

export async function markAsRead(reportId) {
  return markReportAsRead(reportId);
}
