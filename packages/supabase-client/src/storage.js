/**
 * @file packages/supabase-client/src/storage.js
 * Supabase Storage client helpers.
 */
export async function uploadFile(bucket, path, file) {
  return { id: `file-${Date.now()}`, bucket, path, size: file.size };
}
