import { createSidebar } from './components/sidebar/sidebar.js';
import { createTopbar } from './components/topbar/topbar.js';
import { mountForgotPassword } from './pages/forgot-password/forgot-password.js';
import { mountLogin } from './pages/login/login.js';
import { mountResetPassword } from './pages/reset-password/reset-password.js';
import { guardRoute, isPublicRoute } from './route-guards.js';
import { getCurrentRoute, navigate, subscribeToRouteChanges } from './router.js';
import { clearStaffContext, loadStaffContext } from './session.js';
import { startSessionGuard } from './features/auth/session-guard.js';
import { signOut } from './features/auth/auth.client.js';
import { NAVIGATION } from './config.js';
import { createEmptyState, createRetryState } from './components/state-message/state-message.js';
import { mountDashboard } from './pages/dashboard-map/dashboard-map.js';
import { mountReportSheet } from './pages/report-sheet/report-sheet.js';
import { mountReportDetail } from './pages/report-detail/report-detail.js';
import { getCurrentRouteParam } from './router.js';
import { RequestTimeoutError } from './features/with-timeout.js';

const workspacePages = {
  'organisation-approvals': () => import('./pages/organisation-approvals/organisation-approvals.js'),
  posts: () => import('./pages/posts/posts.js'),
  surveys: () => import('./pages/surveys/surveys.js'),
  analytics: () => import('./pages/analytics/analytics.js'),
  'export-data': () => import('./pages/export-data/export-data.js'),
  'my-profile': () => import('./pages/my-profile/my-profile.js'),
  'pilot-mode': () => import('./pages/pilot-mode/pilot-mode.js'),
  'platform-activity': () => import('./pages/platform-activity/platform-activity.js'),
  chat: () => import('./pages/chat-readonly/chat-readonly.js'),
  'manage-profiles': () => import('./pages/manage-profiles/manage-profiles.js'),
  'system-settings': () => import('./pages/system-settings/system-settings.js'),
  'platform-team': () => import('./pages/platform-team/platform-team.js')
};

const root = document.querySelector('#app');
let routeSequence = 0;
let routeNotice = '';
let renderedShellKey = null;

if (!root) throw new Error('The application root element is missing.');

startSessionGuard({
  onSignedOut: () => {
    if (!isPublicRoute(getCurrentRoute())) navigate('login');
  },
  onTimeout: (error) => {
    if (error instanceof RequestTimeoutError) {
      root.replaceChildren(createRetryState({
        title: 'Sign-out timed out',
        message: error.message,
        onRetry: async () => {
          await signOut();
          clearStaffContext();
          renderedShellKey = null;
          navigate('login');
        }
      }));
      return;
    }
    sessionStorage.setItem(
      'civicneuro-platform-notice',
      error
        ? `Your session expired and sign-out could not be confirmed: ${error.message}`
        : 'Your session ended after 30 minutes of inactivity. Sign in again to continue.'
    );
    navigate('login');
  }
});

subscribeToRouteChanges(() => void renderRoute());
void renderRoute();

async function renderRoute() {
  const sequence = ++routeSequence;
  const requestedRoute = getCurrentRoute();
  document.body.dataset.role = 'platform_admin';
  routeNotice = '';

  if (requestedRoute === 'login' || requestedRoute === 'forgot-password' || requestedRoute === 'reset-password') {
    renderedShellKey = null;
    try {
      if (requestedRoute === 'login') {
        const notice = sessionStorage.getItem('civicneuro-platform-notice') ?? '';
        sessionStorage.removeItem('civicneuro-platform-notice');
        await mountLogin(root, { notice });
      } else if (requestedRoute === 'forgot-password') {
        await mountForgotPassword(root);
      } else {
        await mountResetPassword(root);
      }
    } catch (error) {
      renderFatalError(error);
    }
    return;
  }

  let staff;
  try {
    staff = await loadStaffContext();
  } catch (error) {
    if (sequence !== routeSequence) return;
    if (error instanceof RequestTimeoutError) {
      root.replaceChildren(createRetryState({
        title: 'Connection timed out',
        message: error.message,
        onRetry: () => renderRoute()
      }));
      return;
    }
    sessionStorage.setItem('civicneuro-platform-notice', error.message);
    navigate('login');
    return;
  }

  if (sequence !== routeSequence) return;
  if (!staff) {
    navigate('login');
    return;
  }

  const decision = guardRoute(requestedRoute, staff.role);
  if (!decision.allowed) {
    routeNotice = decision.reason;
    navigate(decision.route);
    return;
  }

  const shellKey = `${staff.userId}:${decision.route}:${getCurrentRouteParam()}`;
  if (renderedShellKey === shellKey && root.querySelector('.dash')) return;
  renderedShellKey = shellKey;
  document.body.dataset.role = staff.role;
  await renderShell(staff, decision.route, sequence);
}

async function renderShell(staff, route, sequence) {
  const app = document.createElement('div');
  app.className = 'dash';
  app.classList.toggle('dash-dashboard', route === 'dashboard');
  const sidebar = createSidebar({
    role: staff.role,
    activeRoute: route,
    fullName: staff.fullName,
    onNavigate: navigate
  });
  const main = document.createElement('div');
  main.className = 'dash-main';
  if (route === 'dashboard') {
    const dashboardContent = document.createElement('main');
    dashboardContent.className = 'dashboard-content';
    dashboardContent.setAttribute('aria-live', 'polite');
    main.append(dashboardContent);
    app.append(sidebar, main);
    root.replaceChildren(app);
    await mountDashboard(dashboardContent, { staff, onSignOut: handleSignOut });
    return;
  }

  const topbar = createTopbar({
    role: staff.role,
    fullName: staff.fullName,
    onSignOut: handleSignOut
  });
  const content = document.createElement('main');
  content.className = 'page-content';
  const isWorkspacePage = Boolean(workspacePages[route]);
  const navRoute = route === 'report-detail' ? 'report-sheet' : route;
  const item = NAVIGATION[staff.role].find((entry) => entry.id === navRoute);

  if (route !== 'home' && !isWorkspacePage) {
    const heading = document.createElement('h1');
    heading.className = 'page-title';
    heading.textContent = route === 'report-sheet'
      ? 'Report sheet — all reports'
      : route === 'report-detail' ? 'Report detail' : item?.label ?? 'Dashboard';
    content.append(heading);
    if (route === 'report-sheet') {
      const subtitle = document.createElement('p');
      subtitle.className = 'page-subtitle';
      subtitle.textContent = 'Every report submitted platform-wide, across every organisation';
      content.append(subtitle);
    }
  }

  if (routeNotice) {
    const notice = document.createElement('p');
    notice.className = 'shell-notice';
    notice.setAttribute('role', 'status');
    notice.textContent = routeNotice;
    content.append(notice);
  }

  if (route === 'home') {
    const welcomeName = staff.fullName || staff.email || 'Platform staff';
    content.append(createEmptyState({
      title: `Welcome, ${welcomeName} (${staff.role})`,
      message: 'Platform dashboard pages are being enabled. No sample or mock data is shown.'
    }));
  } else if (route === 'report-sheet' || route === 'report-detail' || isWorkspacePage) {
    const routeContent = document.createElement('div');
    routeContent.className = isWorkspacePage ? 'workspace-route-content' : 'route-content';
    routeContent.setAttribute('aria-live', 'polite');
    const loading = document.createElement('p');
    loading.className = 'muted-note';
    loading.textContent = 'Loading…';
    routeContent.append(loading);
    content.append(routeContent);
  } else {
    const status = document.createElement('section');
    status.className = 'page-placeholder';
    status.setAttribute('aria-live', 'polite');
    const message = document.createElement('p');
    message.textContent = 'This page is not implemented yet. No sample or mock data is shown.';
    status.append(message);
    content.append(status);
  }

  main.append(topbar, content);
  app.append(sidebar, main);
  root.replaceChildren(app);

  const workspaceContent = content.querySelector('.workspace-route-content');
  if (workspaceContent) {
    const pageModule = await workspacePages[route]();
    const pageMount = pageModule[{
      'organisation-approvals': 'mountOrganisationApprovals',
      posts: 'mountPosts',
      surveys: 'mountSurveys',
      analytics: 'mountAnalytics',
      'export-data': 'mountExportData',
      'my-profile': 'mountMyProfile',
      'pilot-mode': 'mountPilotMode',
      'platform-activity': 'mountPlatformActivity',
      chat: 'mountChat',
      'manage-profiles': 'mountManageProfiles',
      'system-settings': 'mountSystemSettings',
      'platform-team': 'mountPlatformTeam'
    }[route]];
    await pageMount(workspaceContent, { staff, onSignOut: handleSignOut });
    if (sequence !== routeSequence) return;
  }
  const routeContent = content.querySelector('.route-content');
  if (!routeContent) return;
  if (route === 'report-sheet') await mountReportSheet(routeContent);
  else await mountReportDetail(routeContent, getCurrentRouteParam());
  if (sequence !== routeSequence) return;
}

async function handleSignOut() {
  try {
    await signOut();
    clearStaffContext();
    renderedShellKey = null;
    navigate('login');
  } catch (error) {
    if (error instanceof RequestTimeoutError) {
      const retry = createRetryState({
        title: 'Sign-out timed out',
        message: error.message,
        onRetry: () => handleSignOut()
      });
      root.querySelector('.page-content')?.prepend(retry);
      return;
    }
    const notice = document.createElement('p');
    notice.className = 'shell-notice';
    notice.setAttribute('role', 'alert');
    notice.textContent = `Could not sign out: ${error.message}`;
    root.querySelector('.page-content')?.prepend(notice);
  }
}

function renderFatalError(error) {
  const message = document.createElement('p');
  message.className = 'shell-notice';
  message.setAttribute('role', 'alert');
  message.textContent = error.message || 'The page could not be loaded.';
  root.replaceChildren(message);
}
