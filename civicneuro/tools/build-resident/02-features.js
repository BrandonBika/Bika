/**
 * @file tools/build-resident/02-features.js
 * Generates all feature clients in apps/resident-pwa/src/features/
 */
import fs from 'node:fs';
import path from 'node:path';

function write(relPath, content) {
  const full = path.resolve('civicneuro', relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trim() + '\n', 'utf8');
  console.log('Wrote:', relPath);
}

// 1. auth
write('apps/resident-pwa/src/features/auth/auth.client.js', `/**
 * @file apps/resident-pwa/src/features/auth/auth.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';
import { startResidentSession, endSession } from '../../session.js';

export async function signIn(identifier, password) {
  const res = await invokeFunction(Endpoints.AUTH_SIGN_IN, { identifier, password });
  if (res.token) {
    startResidentSession(res.token, res.user);
  }
  return res;
}

export async function register(data) {
  return await invokeFunction(Endpoints.AUTH_REGISTER, data);
}

export async function forgotPassword(identifier) {
  return await invokeFunction(Endpoints.AUTH_FORGOT_PASSWORD, { identifier });
}

export async function resetPassword(token, newPassword) {
  return await invokeFunction(Endpoints.AUTH_RESET_PASSWORD, { token, newPassword });
}

export function signOut() {
  endSession();
}
`);

write('apps/resident-pwa/src/features/auth/session-guard.js', `/**
 * @file apps/resident-pwa/src/features/auth/session-guard.js
 */
import { sessionStore } from '../../session.js';

export function requireAuth() {
  const session = sessionStore.get();
  return session.isAuthenticated;
}

export function requireResident() {
  const session = sessionStore.get();
  return session.isAuthenticated && !session.isGuest;
}
`);

// 2. reports
write('apps/resident-pwa/src/features/reports/reports.client.js', `/**
 * @file apps/resident-pwa/src/features/reports/reports.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';
import { enqueueReport } from '@civicneuro/offline-queue';

export async function submitReport(payload, isGuest = false) {
  if (!navigator.onLine) {
    await enqueueReport(payload);
    return { queued: true, message: 'Report saved offline and will sync once connected.' };
  }
  const endpoint = isGuest ? Endpoints.REPORT_GUEST_SUBMIT : Endpoints.REPORT_SUBMIT;
  return await invokeFunction(endpoint, payload);
}

export async function listMyReports() {
  return await invokeFunction(Endpoints.REPORT_LIST_MINE);
}

export async function getReport(idOrRef) {
  return await invokeFunction(Endpoints.REPORT_GET, { id: idOrRef, referenceNumber: idOrRef });
}

export async function trackGuestReport(referenceNumber, contact) {
  return await invokeFunction(Endpoints.REPORT_TRACK, { referenceNumber, contact });
}

export async function escalateReport(reportId, reason) {
  return await invokeFunction(Endpoints.REPORT_ESCALATE, { reportId, reason });
}

export async function withdrawReport(reportId, reason) {
  return await invokeFunction(Endpoints.REPORT_WITHDRAW, { reportId, reason });
}

export async function submitSatisfaction(reportId, rating, comment) {
  return await invokeFunction(Endpoints.REPORT_SATISFACTION, { reportId, rating, comment });
}

export async function reopenReport(reportId, reason) {
  return await invokeFunction(Endpoints.REPORT_REOPEN, { reportId, reason });
}
`);

write('apps/resident-pwa/src/features/reports/quarantine-upload.js', `/**
 * @file apps/resident-pwa/src/features/reports/quarantine-upload.js
 */
import { uploadToQuarantine } from '@civicneuro/media-client';

export async function uploadEvidence(file, onProgress) {
  return await uploadToQuarantine(file, onProgress);
}
`);

// 3. beacon
write('apps/resident-pwa/src/features/beacon/beacon.client.js', `/**
 * @file apps/resident-pwa/src/features/beacon/beacon.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';

export async function getCircleMembers() {
  return await invokeFunction(Endpoints.BEACON_MEMBERS);
}

export async function getCircleRequests() {
  return await invokeFunction(Endpoints.BEACON_REQUESTS);
}

export async function startSharingSession(memberId, durationMinutes) {
  return await invokeFunction(Endpoints.BEACON_START_SHARE, { memberId, durationMinutes });
}

export async function stopSharingSession(sessionId) {
  return await invokeFunction(Endpoints.BEACON_STOP_SHARE, { sessionId });
}
`);

write('apps/resident-pwa/src/features/beacon/realtime-subscription.js', `/**
 * @file apps/resident-pwa/src/features/beacon/realtime-subscription.js
 */
import { subscribeToChannel } from '@civicneuro/supabase-client';

export function subscribeToLiveLocation(channelId, onUpdate) {
  return subscribeToChannel(\`beacon:\${channelId}\`, onUpdate);
}
`);

// 4. lifeline
write('apps/resident-pwa/src/features/lifeline/lifeline.client.js', `/**
 * @file apps/resident-pwa/src/features/lifeline/lifeline.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';

export async function getLifelineCards() {
  return await invokeFunction(Endpoints.LIFELINE_CARDS);
}
`);

// 5. snap-and-say
write('apps/resident-pwa/src/features/snap-and-say/snap-and-say.client.js', `/**
 * @file apps/resident-pwa/src/features/snap-and-say/snap-and-say.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';

export async function transcribeAudio(audioBlob) {
  return await invokeFunction(Endpoints.SNAP_TRANSCRIBE, { audio: audioBlob });
}

export async function analyzeReportIntent(text, photoMeta) {
  return await invokeFunction(Endpoints.SNAP_ANALYZE, { text, photoMeta });
}
`);

// 6. polls, surveys, news
write('apps/resident-pwa/src/features/polls/polls.client.js', `/**
 * @file apps/resident-pwa/src/features/polls/polls.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';

export async function getPolls() {
  return await invokeFunction(Endpoints.POLLS_LIST);
}

export async function votePoll(pollId, optionId) {
  return await invokeFunction(Endpoints.POLLS_VOTE, { pollId, optionId });
}
`);

write('apps/resident-pwa/src/features/surveys/surveys.client.js', `/**
 * @file apps/resident-pwa/src/features/surveys/surveys.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';

export async function getSurveys() {
  return await invokeFunction(Endpoints.SURVEYS_LIST);
}

export async function submitSurvey(surveyId, answers) {
  return await invokeFunction(Endpoints.SURVEYS_SUBMIT, { surveyId, answers });
}
`);

write('apps/resident-pwa/src/features/news/news.client.js', `/**
 * @file apps/resident-pwa/src/features/news/news.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';

export async function getNews() {
  return await invokeFunction(Endpoints.NEWS_LIST);
}
`);

// 7. account, permissions, offline, i18n
write('apps/resident-pwa/src/features/account/account.client.js', `/**
 * @file apps/resident-pwa/src/features/account/account.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';

export async function exportMyData() {
  return await invokeFunction(Endpoints.ACCOUNT_EXPORT);
}

export async function deleteMyAccount(password) {
  return await invokeFunction(Endpoints.ACCOUNT_DELETE, { password });
}
`);

write('apps/resident-pwa/src/features/permissions/permissions.js', `/**
 * @file apps/resident-pwa/src/features/permissions/permissions.js
 */
export async function requestLocationPermission() {
  if (!navigator.geolocation) return { granted: false, reason: 'unsupported' };
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ granted: true, coords: pos.coords }),
      (err) => resolve({ granted: false, error: err.message }),
      { timeout: 8000 }
    );
  });
}

export async function requestCameraPermission() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return { granted: false };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    return { granted: true };
  } catch (e) {
    return { granted: false };
  }
}

export async function requestMicrophonePermission() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return { granted: false };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    return { granted: true };
  } catch (e) {
    return { granted: false };
  }
}
`);

write('apps/resident-pwa/src/features/offline/offline.client.js', `/**
 * @file apps/resident-pwa/src/features/offline/offline.client.js
 */
import { syncOfflineQueue, getQueuedReports } from '@civicneuro/offline-queue';

export async function triggerQueueSync() {
  if (navigator.onLine) {
    return await syncOfflineQueue();
  }
  return [];
}

export async function checkOfflineStatus() {
  const queued = await getQueuedReports();
  return {
    isOnline: navigator.onLine,
    queuedCount: queued.length
  };
}
`);

write('apps/resident-pwa/src/features/i18n/language.js', `/**
 * @file apps/resident-pwa/src/features/i18n/language.js
 */
import { setLocale, getLocale } from '@civicneuro/i18n';

export const availableLanguages = [
  { code: 'en', name: 'English' },
  { code: 'zu', name: 'isiZulu' },
  { code: 'af', name: 'Afrikaans' }
];

export function switchLanguage(code) {
  setLocale(code);
}

export function getCurrentLanguage() {
  return getLocale();
}
`);

console.log('Feature clients generated successfully.');
