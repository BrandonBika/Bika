import { mountWorkspacePage } from '../../features/workspace-pages.js';

export function mountOrganisationApprovals(target, context) {
  return mountWorkspacePage('organisation-approvals', target, context);
}