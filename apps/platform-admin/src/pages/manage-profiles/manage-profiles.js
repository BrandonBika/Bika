import { mountWorkspacePage } from '../../features/workspace-pages.js';

export function mountManageProfiles(target, context) {
  return mountWorkspacePage('manage-profiles', target, context);
}