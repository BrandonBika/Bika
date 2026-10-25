import { mountWorkspacePage } from '../../features/workspace-pages.js';

export function mountAnalytics(target, context) {
  return mountWorkspacePage('analytics', target, context);
}