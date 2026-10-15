/**
 * @file packages/functions-client/src/endpoints.js
 * Registry of known Edge Function endpoints.
 */
export const Endpoints = /** @type {const} */ ({
  AUTH_SIGN_IN: 'auth-sign-in',
  AUTH_REGISTER: 'auth-register',
  AUTH_VERIFY_EMAIL: 'auth-verify-email',
  AUTH_FORGOT_PASSWORD: 'auth-forgot-password',
  AUTH_RESET_PASSWORD: 'auth-reset-password',
  REPORT_SUBMIT: 'report-submit',
  REPORT_GUEST_SUBMIT: 'report-guest-submit',
  REPORT_TRACK: 'report-track',
  REPORT_GET: 'report-get',
  REPORT_LIST_MINE: 'report-list-mine',
  REPORT_UPDATE: 'report-update',
  REPORT_ESCALATE: 'report-escalate',
  REPORT_WITHDRAW: 'report-withdraw',
  REPORT_SATISFACTION: 'report-satisfaction',
  REPORT_REOPEN: 'report-reopen',
  SNAP_TRANSCRIBE: 'snap-transcribe',
  SNAP_ANALYZE: 'snap-analyze',
  POLLS_LIST: 'polls-list',
  POLLS_VOTE: 'polls-vote',
  SURVEYS_LIST: 'surveys-list',
  SURVEYS_SUBMIT: 'surveys-submit',
  NEWS_LIST: 'news-list',
  BEACON_MEMBERS: 'beacon-members',
  BEACON_REQUESTS: 'beacon-requests',
  BEACON_SEND_REQUEST: 'beacon-send-request',
  BEACON_START_SHARE: 'beacon-start-share',
  BEACON_STOP_SHARE: 'beacon-stop-share',
  BEACON_ROUTE: 'beacon-route',
  LIFELINE_CARDS: 'lifeline-cards',
  LIFELINE_CARD_SAVE: 'lifeline-card-save',
  LIFELINE_GROUP_CALL: 'lifeline-group-call',
  ACCOUNT_EXPORT: 'account-export',
  ACCOUNT_DELETE: 'account-delete'
});
