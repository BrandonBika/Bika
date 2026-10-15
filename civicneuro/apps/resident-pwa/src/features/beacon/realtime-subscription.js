/**
 * @file apps/resident-pwa/src/features/beacon/realtime-subscription.js
 */
import { subscribeToChannel } from '@civicneuro/supabase-client';

export function subscribeToLiveLocation(channelId, onUpdate) {
  return subscribeToChannel(`beacon:${channelId}`, onUpdate);
}
