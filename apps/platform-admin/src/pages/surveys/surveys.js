import { mountWorkspacePage } from '../../features/workspace-pages.js';

export function mountSurveys(target, context) {
  return mountWorkspacePage('surveys', target, context);
}