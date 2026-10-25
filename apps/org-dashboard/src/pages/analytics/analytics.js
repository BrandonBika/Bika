import { listReports } from '../../features/reports/reports.client.js';
import { reportsForTab } from '../../features/reports/report-filters.js';

export async function mountAnalytics(target, { context }) {
  target.replaceChildren();
  try {
    const reports = await listReports(context.organization.id);
    if (!target.isConnected) return;
    const counts = new Map();
    for (const report of reports) {
      const category = report.category || report.issue_category
        || report.user_selected_category || report.ai_category || 'Uncategorised';
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    const page = document.createElement('div');
    const grid = document.createElement('div');
    grid.className = 'org-grid';
    for (const [label, count] of [
      ['Total reports', reports.length],
      ['Active reports', reportsForTab(reports, 'active').length],
      ['Historical reports', reportsForTab(reports, 'historical').length]
    ]) {
      const metric = document.createElement('section');
      metric.className = 'org-card org-metric';
      const value = document.createElement('h2');
      value.textContent = String(count);
      const name = document.createElement('p');
      name.textContent = label;
      metric.append(value, name);
      grid.append(metric);
    }
    const categoryCard = document.createElement('section');
    categoryCard.className = 'org-card';
    const heading = document.createElement('h2');
    heading.textContent = 'Reports by category';
    categoryCard.append(heading);
    if (!counts.size) {
      const empty = document.createElement('p');
      empty.className = 'org-empty';
      empty.textContent = 'No reports are available for analysis yet.';
      categoryCard.append(empty);
    } else {
      const list = document.createElement('ul');
      for (const [category, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
        const row = document.createElement('li');
        row.textContent = `${category}: ${count}`;
        list.append(row);
      }
      categoryCard.append(list);
    }
    page.append(grid, categoryCard);
    target.append(page);
  } catch (error) {
    renderError(target, error);
  }
}

function renderError(target, error) {
  const message = document.createElement('p');
  message.className = 'org-message';
  message.setAttribute('role', 'alert');
  message.textContent = error.message || 'Could not load organisation analytics.';
  target.append(message);
}