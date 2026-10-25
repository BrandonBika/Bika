import { mountWorkspacePage } from '../../features/workspace-pages.js';

export function mountChat(target, context) {
  return mountWorkspacePage('chat', target, context);
}