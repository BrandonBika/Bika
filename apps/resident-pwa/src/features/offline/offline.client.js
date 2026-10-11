/**
 * @file apps/resident-pwa/src/features/offline/offline.client.js
 */
import { syncOfflineQueue, getQueuedReports } from '@civicneuro/offline-queue';
import { getAccessToken } from '@civicneuro/supabase-client';

async function submitSnapAndSay(payload) {
  const formData = new FormData();
  const audioType = payload.audioBlob.type || payload.audioMime || 'audio/webm';
  const baseMime = audioType.split(';', 1)[0].toLowerCase();
  const extension = baseMime.includes('mp4') ? 'mp4' : baseMime.includes('ogg') ? 'ogg' : baseMime.includes('aac') ? 'aac' : baseMime.includes('mpeg') ? 'mp3' : baseMime.includes('wav') ? 'wav' : 'webm';
  formData.append('audio', payload.audioBlob, `snap-${Date.now()}.${extension}`);
  if (payload.imageBlob) formData.append('image', payload.imageBlob, `evidence-${Date.now()}`);
  formData.append('duration_seconds', String(payload.durationSeconds));
  formData.append('latitude', String(payload.location.latitude ?? ''));
  formData.append('longitude', String(payload.location.longitude ?? ''));
  formData.append('location_accuracy', String(payload.location.accuracy ?? ''));
  formData.append('device_timestamp', payload.deviceTimestamp);

  const runtimeConfig = (await import('../../../runtime-config.js')).default;
  const token = getAccessToken();
  let response;
  try {
    response = await fetch(`${runtimeConfig.supabaseUrl}/functions/v1/snap-and-say`, {
      method: 'POST',
      headers: {
        apikey: runtimeConfig.supabaseAnonKey,
        Authorization: token ? `Bearer ${token}` : `Bearer ${runtimeConfig.supabaseAnonKey}`
      },
      body: formData
    });
  } catch (error) {
    error.networkFailure = true;
    throw error;
  }
  let body = {};
  try {
    body = await response.json();
  } catch (error) {
    if (response.ok) {
      error.status = response.status;
      throw error;
    }
  }
  if (!response.ok) {
    const failure = new Error(body.message || `The report was rejected (${response.status}).`);
    failure.status = response.status;
    failure.code = body.code;
    throw failure;
  }
  return body.report || body;
}

export async function triggerQueueSync() {
  if (navigator.onLine) {
    return await syncOfflineQueue({ submitSnapAndSay });
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
