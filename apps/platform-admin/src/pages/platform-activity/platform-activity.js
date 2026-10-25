import { mountWorkspacePage } from '../../features/workspace-pages.js';

export function mountPlatformActivity(target, context) {
  return mountWorkspacePage('platform-activity', target, context);
}