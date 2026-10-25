import { mountWorkspacePage } from '../../features/workspace-pages.js';

export function mountPilotMode(target, context) {
  return mountWorkspacePage('pilot-mode', target, context);
}