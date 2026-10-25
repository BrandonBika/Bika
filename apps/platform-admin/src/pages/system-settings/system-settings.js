import { mountWorkspacePage } from '../../features/workspace-pages.js';

export function mountSystemSettings(target, context) {
  return mountWorkspacePage('system-settings', target, context);
}