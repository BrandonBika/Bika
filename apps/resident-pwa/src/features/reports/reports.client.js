/**
 * @file apps/resident-pwa/src/features/reports/reports.client.js
 * Client adapter connecting resident UI actions to reportsStore and backend endpoints.
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';
import { enqueueReport, generateIdempotencyKey } from '@civicneuro/offline-queue';
import { selectRows } from '@civicneuro/supabase-client';
import { sessionStore } from '../../session.js';
import {
  getAllReports,
  getReportById,
  replaceReports,
  addReportMessage,
  addInformationToReport,
  escalateReportById,
  withdrawReportById,
  setReportSatisfaction,
  reopenReportById,
  markReportAsRead,
  addQueuedReport
} from './reports.store.js';

let lastSubmissionReceipt = null;

function appStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'needs review') return 'review';
  if (normalized === 'pending dispatch') return 'open';
  if (normalized === 'dispatched' || normalized === 'acknowledged' || normalized === 'in progress') return 'in_progress';
  if (normalized === 'resolved') return 'resolved';
  if (normalized === 'rejected' || normalized === 'duplicate') return 'closed';
  return normalized.replaceAll(' ', '_') || 'open';
}

function mapReportRow(row) {
  const createdAt = row.created_at || '';
  const displayTime = createdAt ? new Date(createdAt).toLocaleString() : '';
  const category = row.ai_category || row.user_selected_category || row.category || 'General';
  return {
    id: row.id,
    referenceNumber: row.tracking_number || row.id,
    title: category,
    category,
    location: row.user_reported_address || row.location_name || row.extracted_location || '',
    status: appStatus(row.status),
    displayTime,
    lastUpdatedAt: row.updated_at || createdAt,
    description: row.description_english || row.description || row.description_original || '',
    organisation: row.user_selected_organization ? { name: row.user_selected_organization } : null,
    unreadCount: 0,
    satisfaction: null,
    timeline: [],
    messages: []
  };
}

function mapTrackedReport(report) {
  return mapReportRow({
    id: report.tracking_number,
    tracking_number: report.tracking_number,
    status: report.status,
    report_level: report.level,
    ai_category: report.category,
    created_at: report.created_at,
    updated_at: report.updated_at,
    resolved_at: report.resolved_at
  });
}

export async function submitReport(payload, isGuest = false) {
  const endpoint = isGuest ? Endpoints.REPORT_GUEST_SUBMIT : Endpoints.REPORT_SUBMIT;
  const requestPayload = {
    ...payload,
    idempotency_key: payload.idempotency_key || generateIdempotencyKey()
  };
  lastSubmissionReceipt = null;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const queued = await enqueueReport(requestPayload, endpoint);
    addQueuedReport({ ...requestPayload, idempotency_key: queued.idempotencyKey });
    return { queued: true, message: 'Report saved offline and will sync once connected.' };
  }
  const result = await invokeFunction(endpoint, requestPayload);
  lastSubmissionReceipt = result.receipt || result.report || null;
  return {
    ...result,
    referenceNumber: lastSubmissionReceipt?.tracking_number || result.referenceNumber
  };
}

export function getLastSubmissionReceipt() {
  return lastSubmissionReceipt;
}

export async function listMyReports() {
  const user = sessionStore.get()?.user;
  if (!user?.id || sessionStore.get()?.isGuest) {
    throw new Error('Sign in as a resident to load your report history.');
  }
  const rows = await selectRows(
    'reports',
    { reporter_id: user.id },
    'id,tracking_number,status,ai_category,user_selected_category,category,user_reported_address,location_name,extracted_location,description_english,description,description_original,user_selected_organization,created_at,updated_at,resolved_at'
  );
  const reports = rows.map(mapReportRow);
  replaceReports(reports);
  return { reports };
}

export async function getReport(idOrRef) {
  const rep = getReportById(idOrRef);
  if (rep) return rep;
  return await invokeFunction(Endpoints.REPORT_GET, { id: idOrRef, referenceNumber: idOrRef });
}

export async function trackGuestReport(trackingNumber, lookupCode, captchaToken = '') {
  const report = await invokeFunction(Endpoints.REPORT_TRACK, {
    tracking_number: trackingNumber,
    lookup_code: lookupCode,
    ...(captchaToken && !captchaToken.startsWith('mock-captcha-')
      ? { captcha_token: captchaToken }
      : {})
  });
  replaceReports([mapTrackedReport(report)]);
  return {
    ...report,
    id: report.tracking_number,
    referenceNumber: report.tracking_number
  };
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
