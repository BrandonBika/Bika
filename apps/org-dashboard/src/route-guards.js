import { NAVIGATION, ORG_ROLES, PUBLIC_ROUTES } from './config.js';

export function isPublicRoute(route) {
  return PUBLIC_ROUTES.includes(route);
}

export function guardRoute(route, role) {
  if (isPublicRoute(route)) return { route, allowed: true };
  if (route === 'report-detail') {
    return NAVIGATION[role]?.some((item) => item.id === 'report-sheet')
      ? { route, allowed: true }
      : { route: 'dashboard', allowed: false, reason: 'This page is not available.' };
  }

  const item = NAVIGATION[role]?.find((entry) => entry.id === route);
  if (!item) {
    return {
      route: 'dashboard',
      allowed: false,
      reason: role === ORG_ROLES.EMPLOYEE
        ? 'This page is available to organisation administrators only.'
        : 'This page is not available.'
    };
  }
  if (item.adminOnly && role !== ORG_ROLES.ADMIN) {
    return {
      route: 'dashboard',
      allowed: false,
      reason: 'This page is available to organisation administrators only.'
    };
  }
  return { route, allowed: true };
}