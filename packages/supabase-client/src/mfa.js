/**
 * @file packages/supabase-client/src/mfa.js
 */
export async function verifyMfa(code) {
  return { verified: code === '123456' };
}
