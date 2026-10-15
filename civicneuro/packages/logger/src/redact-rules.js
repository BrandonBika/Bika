/**
 * @file packages/logger/src/redact-rules.js
 * Re-exports redact utilities from security-web for use in Edge Functions
 * (synced into supabase/functions/_shared/vendor/).
 */
export { redactString, redactDeep } from '../../security-web/src/redact.js';
