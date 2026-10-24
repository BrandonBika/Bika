import { NAVIGATION, PUBLIC_ROUTES } from './config.js';

const routeItems = new Map(
  Object.values(NAVIGATION)
    .flat()
    .map((item) => [item.id, item])
);

export function isPublicRoute(route) {
  return PUBLIC_ROUTES.includes(route);
}

export function guardRoute(route, role) {
  if (route === 'home') return { route, allowed: true };
  if (isPublicRoute(route)) return { route, allowed: true };

  if (route === 'report-detail') {
    const reportSheetEnabled = NAVIGATION[role]?.some(
      (roleItem) => roleItem.id === 'report-sheet' && roleItem.enabled
    );
    return reportSheetEnabled
      ? { route, allowed: true }
      : { route: 'home', allowed: false, reason: 'This page is not enabled yet.' };
  }

  const item = routeItems.get(route);
  if (!item) {
    return { route: 'home', allowed: false, reason: 'This page does not exist.' };
  }

  const roleItems = NAVIGATION[role];
  if (!roleItems || !roleItems.some((roleItem) => roleItem.id === route)) {
    return {
      route: 'home',
      allowed: false,
      reason: role === 'platform_employee'
        ? 'This page is only available to Platform Admins.'
        : 'This page is not available.'
    };
  }

  if (!item.enabled) {
    return {
      route: 'home',
      allowed: false,
      reason: 'This page is not enabled yet.'
    };
  }

  return { route, allowed: true };
}