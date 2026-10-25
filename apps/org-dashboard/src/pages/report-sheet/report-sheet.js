import { listReports } from '../../features/reports/reports.client.js';
import { reportsForTab } from '../../features/reports/report-filters.js';
import { navigate } from '../../router.js';

export async function mountReportSheet(target, { context }) {
  target.replaceChildren();
  const page = document.createElement('div');
  page.className = 'org-report-sheet';
  let selectedTab = 'active';
  let allReports = [];
  try {
    allReports = await listReports(context.organization.id);
  } catch (error) {
    renderError(target, error);
    return;
  }
  if (!target.isConnected) return;

  const tabs = document.createElement('div');
  tabs.className = 'org-tabs';
  const activeButton = makeTab('Active');
  const historicalButton = makeTab('Historical');
  const count = document.createElement('p');
  count.className = 'org-muted';
  const tableWrap = document.createElement('div');
  tableWrap.className = 'org-table-wrap';
  page.append(tabs, count, tableWrap);
  tabs.append(activeButton, historicalButton);
  target.append(page);

  activeButton.addEventListener('click', () => {
    selectedTab = 'active';
    render();
  });
  historicalButton.addEventListener('click', () => {
    selectedTab = 'historical';
    render();
  });
  render();

  function render() {
    activeButton.setAttribute('aria-pressed', String(selectedTab === 'active'));
    historicalButton.setAttribute('aria-pressed', String(selectedTab === 'historical'));
    const reports = reportsForTab(allReports, selectedTab);
    count.textContent = `${reports.length} ${selectedTab} reports`;
    tableWrap.replaceChildren();
    if (!reports.length) {
      const empty = document.createElement('p');
      empty.className = 'org-empty';
      empty.textContent = selectedTab === 'active'
        ? 'No active reports are assigned to this organisation.'
        : 'No historical reports are available yet.';
      tableWrap.append(empty);
      return;
    }
    const table = document.createElement('table');
    table.className = 'org-table';
    const head = table.createTHead().insertRow();
    for (const label of ['Tracking number', 'Status', 'Category', 'Reported']) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      head.append(cell);
    }
    const body = table.createTBody();
    for (const report of reports) {
      const row = body.insertRow();
      row.tabIndex = 0;
      row.addEventListener('click', () => navigate('report-detail', report.id));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate('report-detail', report.id);
        }
      });
      for (const value of [
        report.tracking_number || 'Report',
        report.status,
        report.category || report.issue_category || 'Not provided',
        formatDate(report.created_at)
      ]) {
        const cell = row.insertCell();
        cell.textContent = value;
      }
    }
    tableWrap.append(table);
  }
}

function makeTab(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'org-button secondary';
  button.textContent = label;
  return button;
}

function formatDate(value) {
  if (!value) return 'Not provided';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleString();
}

function renderError(target, error) {
  const message = document.createElement('p');
  message.className = 'org-message';
  message.setAttribute('role', 'alert');
  message.textContent = error.message || 'Could not load reports.';
  target.append(message);
}