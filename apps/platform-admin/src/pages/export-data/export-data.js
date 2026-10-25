import { mountWorkspacePage } from '../../features/workspace-pages.js';

export function mountExportData(target, context) {
  return mountWorkspacePage('export-data', target, context);
}