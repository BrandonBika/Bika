export const ORG_ROLES = Object.freeze({
  ADMIN: 'org_admin',
  EMPLOYEE: 'org_employee'
});

export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

const page = (id, label, adminOnly = false) => Object.freeze({
  id,
  label,
  adminOnly
});

export const NAVIGATION = Object.freeze({
  [ORG_ROLES.ADMIN]: Object.freeze([
    page('dashboard', 'Dashboard'),
    page('report-sheet', 'Report sheet'),
    page('posts', 'Posts'),
    page('chat', 'Chat'),
    page('surveys', 'Surveys'),
    page('analytics', 'Analytics'),
    page('manage-profiles', 'Manage profiles', true),
    page('export-data', 'Export data'),
    page('my-profile', 'My profile'),
    page('system-settings', 'System settings', true)
  ]),
  [ORG_ROLES.EMPLOYEE]: Object.freeze([
    page('dashboard', 'Dashboard'),
    page('report-sheet', 'Report sheet'),
    page('posts', 'Posts'),
    page('chat', 'Chat'),
    page('surveys', 'Surveys'),
    page('analytics', 'Analytics'),
    page('export-data', 'Export data'),
    page('my-profile', 'My profile')
  ])
});

export const PUBLIC_ROUTES = Object.freeze([
  'login',
  'register',
  'application-pending',
  'forgot-password',
  'reset-password',
  'session-expired',
  'invitation',
  'create-password',
  'expired-invite'
]);

export const ROUTE_TITLES = Object.freeze({
  dashboard: 'Dashboard',
  'report-sheet': 'Report sheet',
  'report-detail': 'Report detail',
  posts: 'Posts',
  chat: 'Chat',
  surveys: 'Surveys',
  analytics: 'Analytics',
  'manage-profiles': 'Manage profiles',
  'export-data': 'Export data',
  'my-profile': 'My profile',
  'system-settings': 'System settings'
});