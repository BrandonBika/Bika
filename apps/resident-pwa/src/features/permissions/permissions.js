/**
 * @file apps/resident-pwa/src/features/permissions/permissions.js
 */
export async function requestLocationPermission() {
  if (!globalThis.navigator?.geolocation) return { granted: false, reason: 'unsupported' };
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ granted: true, coords: pos.coords }),
      (err) => resolve({
        granted: false,
        reason: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable',
        error: err.message
      }),
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
