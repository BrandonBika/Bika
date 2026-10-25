import { mountWorkspacePage } from '../../features/workspace-pages.js';

export function mountPosts(target, context) {
  return mountWorkspacePage('posts', target, context);
}