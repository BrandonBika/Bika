import runtimeConfig from '../runtime-config.js';

export const PLATFORM_ROLES = Object.freeze({
  ADMIN: 'platform_admin',
  EMPLOYEE: 'platform_employee'
});

export const SUPABASE_CONFIG = Object.freeze({
  url: runtimeConfig.supabaseUrl,
  anonKey: runtimeConfig.supabaseAnonKey
});

export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
export const APP_BASE_PATH = new URL('../', import.meta.url).pathname;

export const MAP_CONFIG = Object.freeze({
  tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  defaultCenter: Object.freeze({ lat: -29.8587, lng: 31.0218 }),
  defaultZoom: 13
});

const item = (id, label, enabled) => Object.freeze({
  id,
  label,
  path: `/${id}`,
  enabled
});

export const NAVIGATION = Object.freeze({
  [PLATFORM_ROLES.ADMIN]: Object.freeze([
    item('dashboard', 'Dashboard', true),
    item('report-sheet', 'Report sheet', true),
    item('posts', 'Posts', true),
    item('chat', 'Chat', false),
    item('surveys', 'Surveys', true),
    item('analytics', 'Analytics', false),
    item('manage-profiles', 'Manage profiles', false),
    item('export-data', 'Export data', false),
    item('my-profile', 'My profile', false),
    item('organisation-approvals', 'Organisation approvals', true),
    item('pilot-mode', 'Pilot mode', false),
    item('platform-activity', 'Platform activity', false),
    item('system-settings', 'System settings', false),
    item('platform-team', 'Platform team', false)
  ]),
  [PLATFORM_ROLES.EMPLOYEE]: Object.freeze([
    item('dashboard', 'Dashboard', true),
    item('report-sheet', 'Report sheet', true),
    item('posts', 'Posts', true),
    item('chat', 'Chat', false),
    item('surveys', 'Surveys', true),
    item('analytics', 'Analytics', false),
    item('export-data', 'Export data', false),
    item('my-profile', 'My profile', false),
    item('organisation-approvals', 'Organisation approvals', true),
    item('pilot-mode', 'Pilot mode', false),
    item('platform-activity', 'Platform activity', false)
  ])
});

export const PUBLIC_ROUTES = Object.freeze([
  'login',
  'forgot-password',
  'reset-password'
]);
