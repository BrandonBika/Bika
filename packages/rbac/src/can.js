/**
 * @file packages/rbac/src/can.js
 */
import { RolePermissions } from './matrix.js';

export function can(role, permission) {
  const allowed = RolePermissions[role] || [];
  return allowed.includes(permission);
}
