/**
 * @file apps/resident-pwa/src/config.js
 * Central runtime configuration for Resident PWA.
 */
import runtimeConfig from '../runtime-config.js';
import runtimeOptions from '../runtime-options.js';

export const config = {
  env: runtimeOptions.env || 'development',
  useMock: runtimeOptions.useMock === true,
  beaconEnabled: runtimeOptions.beaconEnabled === true,
  supabaseUrl: runtimeConfig.supabaseUrl || '',
  supabaseAnonKey: runtimeConfig.supabaseAnonKey || '',
  tileHost: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  defaultCenter: { lat: -29.8587, lng: 31.0218 }, // Durban, ZA
  defaultZoom: 13,
  supportPhone: '0800000000',
  mediaLimits: {
    maxPhotos: 4,
    maxPhotoSizeMB: 10,
    maxVoiceSeconds: 60
  }
};
