import { createSidebar } from './components/sidebar/sidebar.js';
import { signOut } from './features/auth/auth.client.js';
import { getCurrentRoute, navigate, subscribeToRouteChanges, getCurrentRouteParam } from './router.js';
import { guardRoute, isPublicRoute } from './route-guards.js';
import { loadOrganizationContext, startSessionGuard } from './session.js';
import {
  mountApplicationPending,
  mountForgotPassword,
  mountInviteUnavailable,
  mountLogin,
  mountRegistration,
  mountResetPassword,
  mountSessionExpired
} from './pages/auth-pages.js';
import { ROUTE_TITLES } from './config.js';

const root = document.querySelector('#app');
if (!root) throw new Error('The Bika organisation app root is missing.');

let routeGeneration = 0;
let stopSessionGuard = null;
let routeMessage = '';
let loginNotice = '';
const pageLoaders = {
  dashboard: () => import('./pages/dashboard-map/dashboard-map.js'),
  'report-sheet': () => import('./pages/report-sheet/report-sheet.js'),
  'report-detail': () => import('./pages/report-detail/report-detail.js')
};

subscribeToRouteChanges(() => void renderRoute());
void renderRoute();

async function renderRoute() {
  const generation = ++routeGeneration;
  const route = getCurrentRoute();
  if (isPublicRoute(route)) {
    stopSessionGuard?.();
    stopSessionGuard = null;
    renderPublicPage(route);
    return;
  }

  let context;
  try {
    context = await loadOrganizationContext();
  } catch (error) {
    if (generation !== routeGeneration) return;
    renderAccessError(error);
    return;
  }
  if (generation !== routeGeneration) return;
  if (!context) {
    loginNotice = 'Sign in to continue.';
    navigate('login');
    return;
  }
  if (context.blocked) {
    sessionStorage.setItem('bika-org-blocked-message', context.message);
    sessionStorage.setItem('bika-org-blocked-status', context.status);
    navigate('application-pending');
    return;
  }

  const decision = guardRoute(route, context.role);
  if (!decision.allowed) {
    routeMessage = decision.reason;
    await renderWorkspace(context, decision.route, '');
    return;
  }
  routeMessage = '';
  await renderWorkspace(context, decision.route, getCurrentRouteParam());
  if (!stopSessionGuard) {
    stopSessionGuard = startSessionGuard((error) => {
      loginNotice = error
        ? `Session expired; sign-out could not be confirmed: ${error.message}`
        : '';
      navigate('session-expired');
    });
  }
}

function renderPublicPage(route) {
  if (route === 'login') mountLogin(root, loginNotice);
  else if (route === 'register') mountRegistration(root);
  else if (route === 'application-pending') mountApplicationPending(root);
  else if (route === 'forgot-password') mountForgotPassword(root);
  else if (route === 'reset-password') mountResetPassword(root);
  else if (route === 'session-expired') mountSessionExpired(root);
  else if (route === 'expired-invite') mountInviteUnavailable(root, true);
  else mountInviteUnavailable(root);
}

async function renderWorkspace(context, route, routeParam) {
  const app = document.createElement('div');
  app.className = 'dash org-shell';
  const sidebar = createSidebar(context, route === 'report-detail' ? 'report-sheet' : route);
  const main = document.createElement('div');
  main.className = 'dash-main';
  const topbar = document.createElement('header');
  topbar.className = 'org-topbar';
  const title = document.createElement('h1');
  title.textContent = ROUTE_TITLES[route] || 'Bika';
  const org = document.createElement('span');
  org.textContent = context.organization.name;
  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'org-button secondary';
  logout.textContent = 'Sign out';
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    try {
      await signOut();
      stopSessionGuard?.();
      stopSessionGuard = null;
      navigate('login');
    } catch (error) {
      showWorkspaceMessage(content, error.message, true);
      logout.disabled = false;
    }
  });
  topbar.append(title, org, logout);
  const content = document.createElement('main');
  content.className = 'page-content org-content';
  content.setAttribute('aria-live', 'polite');
  if (routeMessage) showWorkspaceMessage(content, routeMessage, false);
  main.append(topbar, content);
  app.append(sidebar, main);
  root.replaceChildren(app);

  const loadPage = pageLoaders[route];
  if (!loadPage) {
    showUnavailablePage(content, route, routeParam, context.role);
    return;
  }
  try {
    const page = await loadPage();
    if (!content.isConnected) return;
    const mount = route === 'dashboard'
      ? page.mountDashboard
      : route === 'report-sheet'
        ? page.mountReportSheet
        : page.mountReportDetail;
    await mount(content, { context, reportId: routeParam });
  } catch (error) {
    if (content.isConnected) showWorkspaceMessage(content, error.message || 'Could not load this page.', true);
  }
}

function showUnavailablePage(target, route, routeParam, role) {
  const card = document.createElement('section');
  card.className = 'org-card';
  const title = document.createElement('h2');
  title.textContent = route === 'report-detail' && routeParam
    ? 'Report detail'
    : ROUTE_TITLES[route] || 'Bika';
  const message = document.createElement('p');
  message.className = 'org-muted';
  message.textContent = 'This page is not available yet.';
  if (role === 'org_employee' && ['posts', 'surveys'].includes(route)) {
    message.textContent = 'No organisation content is available yet.';
  }
  card.append(title, message);
  target.append(card);
}

function renderAccessError(error) {
  root.replaceChildren();
  const main = document.createElement('main');
  main.className = 'org-auth';
  const card = document.createElement('section');
  card.className = 'org-auth-card';
  const title = document.createElement('h1');
  title.textContent = 'Could not verify access';
  const message = document.createElement('p');
  message.textContent = error.message || 'Sign in again to continue.';
  const link = document.createElement('a');
  link.href = '#/login';
  link.textContent = 'Return to sign in';
  card.append(title, message, link);
  main.append(card);
  root.append(main);
}

function showWorkspaceMessage(target, text, isError) {
  const message = document.createElement('p');
  message.className = 'org-message';
  message.setAttribute('role', isError ? 'alert' : 'status');
  message.textContent = text;
  target.prepend(message);
}