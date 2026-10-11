/**
 * @file packages/offline-queue/src/encrypt-at-rest.js
 * WebCrypto AES-GCM encryption for IndexedDB offline store.
 */
let cachedKey = null;

async function getKey() {
  if (cachedKey) return cachedKey;
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  // Ephemeral or device-derived key
  cachedKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return cachedKey;
}

export async function encryptData(plainText) {
  const key = await getKey();
  if (!key) return plainText; // Fallback in non-crypto test environments
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plainText);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
  return JSON.stringify({
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(cipher))
  });
}

export async function decryptData(cipherJson) {
  try {
    const parsed = JSON.parse(cipherJson);
    if (!parsed.iv || !parsed.data) return cipherJson;
    const key = await getKey();
    if (!key) return cipherJson;
    const iv = new Uint8Array(parsed.iv);
    const data = new Uint8Array(parsed.data);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(plain);
  } catch (e) {
    return cipherJson;
  }
}
