import { mountWorkspacePage } from '../../features/workspace-pages.js';

export function mountMyProfile(target, context) {
  return mountWorkspacePage('my-profile', target, context);
}