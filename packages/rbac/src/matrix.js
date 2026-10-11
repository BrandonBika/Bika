/**
 * @file packages/rbac/src/matrix.js
 */
import { Roles } from './roles.js';

export const Permissions = /** @type {const} */ ({
  REPORT_CREATE: 'report:create',
  REPORT_VIEW_MINE: 'report:view_mine',
  REPORT_VIEW_ALL: 'report:view_all',
  REPORT_UPDATE: 'report:update',
  REPORT_DELETE: 'report:delete',
  BEACON_USE: 'beacon:use',
  LIFELINE_USE: 'lifeline:use',
  POLL_VOTE: 'poll:vote',
  SURVEY_ANSWER: 'survey:answer'
});

export const RolePermissions = {
  [Roles.GUEST]: [
    Permissions.REPORT_CREATE
  ],
  [Roles.RESIDENT]: [
    Permissions.REPORT_CREATE,
    Permissions.REPORT_VIEW_MINE,
    Permissions.BEACON_USE,
    Permissions.LIFELINE_USE,
    Permissions.POLL_VOTE,
    Permissions.SURVEY_ANSWER
  ],
  [Roles.ORG_EMPLOYEE]: [
    Permissions.REPORT_CREATE,
    Permissions.REPORT_VIEW_ALL,
    Permissions.REPORT_UPDATE
  ],
  [Roles.ORG_ADMIN]: [
    Permissions.REPORT_CREATE,
    Permissions.REPORT_VIEW_ALL,
    Permissions.REPORT_UPDATE,
    Permissions.REPORT_DELETE
  ],
  [Roles.PLATFORM_EMPLOYEE]: [
    Permissions.REPORT_VIEW_ALL
  ],
  [Roles.PLATFORM_ADMIN]: Object.values(Permissions)
};
