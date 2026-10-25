import { mountWorkspacePage } from '../../features/workspace-pages.js';

export function mountPlatformTeam(target, context) {
  return mountWorkspacePage('platform-team', target, context);
}