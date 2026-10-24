import { createEmptyState, createRetryState } from '../../components/state-message/state-message.js';
import { getReportSheetData } from '../../features/reports.client.js';
import { resolveReporterDisplay } from '../../features/reporter-display.js';
import { getCategoryLabel, getStatusLabel } from '../../features/status-labels.js';

const HISTORICAL_STATUSES = new Set(['Resolved', 'Rejected', 'Duplicate']);
const PAGE_SIZE = 25;

export async function mountReportSheet(target) {
  target.replaceChildren();
  try {
    const data = await getReportSheetData();
    if (!target.isConnected) return;
    renderReportSheet(target, data);
  } catch (error) {
    target.replaceChildren(createRetryState({
      title: 'No access: check your staff account',
      message: error.message,
      onRetry: () => mountReportSheet(target)
    }));
  }
}

function renderReportSheet(target, data) {
  const { reports, organizations } = data;
  const state = {
    tab: 'active',
    status: '',
    category: '',
    organization: '',
    unassigned: false,
    search: '',
    sortAscending: false,
    page: 0
  };
  const page = document.createElement('div');
  page.className = 'report-sheet-page';
  const toolbar = document.createElement('section');
  toolbar.className = 'sheet-actionbar';

  const search = document.createElement('input');
  search.className = 'sheet-search';
  search.type = 'search';
  search.placeholder = 'Search tracking number';
  search.setAttribute('aria-label', 'Search tracking number');
  search.addEventListener('input', () => {
    state.search = search.value.trim().toLocaleLowerCase();
    state.page = 0;
    drawRows();
  });

  const statusFilter = makeSelect('All statuses', unique(reports.map((report) => report.status)));
  statusFilter.addEventListener('change', () => {
    state.status = statusFilter.value;
    state.page = 0;
    drawRows();
  });
  const categoryFilter = makeSelect('All categories', unique(reports.map(categoryOf)));
  categoryFilter.addEventListener('change', () => {
    state.category = categoryFilter.value;
    state.page = 0;
    drawRows();
  });
  const organizationFilter = document.createElement('select');
  organizationFilter.className = 'sheet-select';
  organizationFilter.setAttribute('aria-label', 'Filter by organisation');
  addOption(organizationFilter, '', organizations.length ? 'All organisations' : 'No organisations yet');
  organizationFilter.disabled = organizations.length === 0;
  for (const organization of organizations) addOption(organizationFilter, organization.id, organization.name);
  organizationFilter.addEventListener('change', () => {
    state.organization = organizationFilter.value;
    state.page = 0;
    drawRows();
  });
  const unassignedLabel = document.createElement('label');
  unassignedLabel.className = 'sheet-unassigned-filter';
  const unassigned = document.createElement('input');
  unassigned.type = 'checkbox';
  unassigned.addEventListener('change', () => {
    state.unassigned = unassigned.checked;
    state.page = 0;
    drawRows();
  });
  const filterText = document.createElement('span');
  filterText.textContent = 'Unassigned / misallocated';
  unassignedLabel.append(unassigned, filterText);
  toolbar.append(search, statusFilter, categoryFilter, organizationFilter, unassignedLabel);

  const tabs = document.createElement('div');
  tabs.className = 'sheet-tabs';
  const activeTab = createTab('Active reports', 0);
  const historicalTab = createTab('Historical reports', 0);
  activeTab.button.addEventListener('click', () => {
    state.tab = 'active';
    state.page = 0;
    drawRows();
  });
  historicalTab.button.addEventListener('click', () => {
    state.tab = 'historical';
    state.page = 0;
    drawRows();
  });
  tabs.append(activeTab.button, historicalTab.button);

  const countLine = document.createElement('div');
  countLine.className = 'sheet-count-line';
  const tableWrap = document.createElement('div');
  tableWrap.className = 'sheet-table-wrap';
  const table = document.createElement('table');
  table.className = 'sheet-table';
  const thead = document.createElement('thead');
  const headingRow = document.createElement('tr');
  for (const title of ['Reporter', 'Organisation', 'Category', 'Location', 'Date reported', 'Status', 'Actions']) {
    const heading = document.createElement('th');
    heading.textContent = title;
    headingRow.append(heading);
  }
  const dateHeading = headingRow.children[4];
  const sortDate = document.createElement('button');
  sortDate.type = 'button';
  sortDate.className = 'sheet-sort';
  sortDate.textContent = 'Date reported ↓';
  sortDate.addEventListener('click', () => {
    state.sortAscending = !state.sortAscending;
    sortDate.textContent = `Date reported ${state.sortAscending ? '↑' : '↓'}`;
    drawRows();
  });
  dateHeading.replaceChildren(sortDate);
  thead.append(headingRow);
  const tbody = document.createElement('tbody');
  table.append(thead, tbody);
  tableWrap.append(table);
  const emptyState = document.createElement('div');
  const pagination = document.createElement('div');
  pagination.className = 'report-pagination';
  const pageInfo = document.createElement('span');
  const previous = makeButton('Previous');
  previous.addEventListener('click', () => {
    state.page = Math.max(0, state.page - 1);
    drawRows();
  });
  const next = makeButton('Next');
  next.addEventListener('click', () => {
    state.page += 1;
    drawRows();
  });
  pagination.append(pageInfo, previous, next);
  page.append(toolbar, tabs, countLine, tableWrap, emptyState, pagination);

  function drawRows() {
    const candidates = reports.filter((report) => {
      const category = categoryOf(report);
      if (state.status && report.status !== state.status) return false;
      if (state.category && category !== state.category) return false;
      if (state.organization && report.assigned_organization_id !== state.organization) return false;
      if (state.unassigned && !isUnassignedOrMisallocated(report)) return false;
      if (state.search && !String(report.tracking_number ?? '').toLocaleLowerCase().includes(state.search)) return false;
      return true;
    });
    const activeCount = candidates.filter((report) => !HISTORICAL_STATUSES.has(report.status)).length;
    const historicalCount = candidates.length - activeCount;
    const unassignedCount = candidates.filter((report) => isNullish(report.assigned_organization_id)).length;
    activeTab.count.textContent = String(activeCount);
    historicalTab.count.textContent = String(historicalCount);
    activeTab.button.classList.toggle('active', state.tab === 'active');
    historicalTab.button.classList.toggle('active', state.tab === 'historical');
    activeTab.button.setAttribute('aria-pressed', String(state.tab === 'active'));
    historicalTab.button.setAttribute('aria-pressed', String(state.tab === 'historical'));
    countLine.textContent = `${activeCount} active · ${historicalCount} historical · ${candidates.length} total · ${unassignedCount} unassigned`;

    const rowsToShow = candidates.filter((report) => (
      state.tab === 'historical'
        ? HISTORICAL_STATUSES.has(report.status)
        : !HISTORICAL_STATUSES.has(report.status)
    )).sort((left, right) => {
      const difference = new Date(left.created_at ?? 0) - new Date(right.created_at ?? 0);
      return state.sortAscending ? difference : -difference;
    });
    const pageCount = Math.ceil(rowsToShow.length / PAGE_SIZE);
    state.page = Math.min(state.page, Math.max(0, pageCount - 1));
    const pageRows = rowsToShow.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
    tbody.replaceChildren(...pageRows.map((report) => createReportRow(report, data)));
    emptyState.replaceChildren();
    if (pageRows.length === 0) {
      emptyState.append(createEmptyState({
        title: state.tab === 'historical' ? 'No historical reports' : 'No reports match these filters',
        message: state.tab === 'historical'
          ? 'Resolved, rejected, and duplicate reports will appear here when available.'
          : 'Try changing or clearing the filters.'
      }));
    }
    tableWrap.hidden = pageRows.length === 0;
    emptyState.hidden = pageRows.length !== 0;
    pageInfo.textContent = rowsToShow.length
      ? `Showing ${state.page * PAGE_SIZE + 1}–${Math.min((state.page + 1) * PAGE_SIZE, rowsToShow.length)} of ${rowsToShow.length}`
      : '0 reports';
    previous.disabled = state.page === 0;
    next.disabled = state.page + 1 >= pageCount;
  }

  target.replaceChildren(page);
  drawRows();
}

function createReportRow(report, data) {
  const row = document.createElement('tr');
  const reporter = resolveReporterDisplay({
    report,
    profile: data.residentProfiles.get(report.reporter_id),
    guestContact: data.guestContacts.get(report.id)
  });
  const reporterCell = document.createElement('td');
  const reporterName = document.createElement('div');
  reporterName.className = 'rep-name';
  reporterName.textContent = reporter.name;
  const tracking = document.createElement('div');
  tracking.className = 'rep-sub';
  tracking.textContent = report.tracking_number || 'No tracking number';
  reporterCell.append(reporterName, tracking);
  if (reporter.phone) {
    const phone = document.createElement('div');
    phone.className = 'cell-sub';
    phone.textContent = reporter.phone;
    reporterCell.append(phone);
  }

  const organizationCell = document.createElement('td');
  if (isNullish(report.assigned_organization_id)) {
    organizationCell.append(createPill('Unassigned', 'pill-unassigned'));
  } else {
    organizationCell.textContent = data.organizations
      .find((organization) => organization.id === report.assigned_organization_id)?.name
      ?? 'Organisation unavailable';
  }
  const categoryCell = document.createElement('td');
  categoryCell.textContent = categoryOf(report);
  const locationCell = document.createElement('td');
  const locationName = document.createElement('div');
  locationName.className = 'rep-name';
  locationName.textContent = report.location_name || 'Captured location';
  locationCell.append(locationName);
  const latitude = coordinate(report.latitude, report.location_lat);
  const longitude = coordinate(report.longitude, report.location_lng);
  if (latitude !== null && longitude !== null) {
    const coordinates = document.createElement('div');
    coordinates.className = 'cell-sub';
    coordinates.textContent = `${latitude}, ${longitude}`;
    locationCell.append(coordinates);
  }
  const dateCell = document.createElement('td');
  dateCell.textContent = dateOnly(report.created_at);
  const statusCell = document.createElement('td');
  const statusPill = createPill(getStatusLabel(report.status), statusClass(report.status));
  statusPill.title = String(report.status ?? '');
  statusCell.append(statusPill);
  const actionCell = document.createElement('td');
  const view = makeButton('View');
  view.className = 'sheet-view-button';
  view.addEventListener('click', () => {
    window.location.hash = `/report-detail/${encodeURIComponent(report.id)}`;
  });
  actionCell.append(view);
  row.append(reporterCell, organizationCell, categoryCell, locationCell, dateCell, statusCell, actionCell);
  return row;
}

function createTab(title, count) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sheet-tab';
  const text = document.createElement('span');
  text.textContent = title;
  const badge = document.createElement('span');
  badge.className = 'n';
  badge.textContent = String(count);
  button.append(text, badge);
  return { button, count: badge };
}

function createPill(label, className) {
  const pill = document.createElement('span');
  pill.className = `status-pill ${className}`;
  pill.textContent = label;
  return pill;
}

function statusClass(status) {
  const key = String(status ?? '').toLocaleLowerCase();
  if (key === 'pending dispatch' || key === 'new') return 'pill-pending';
  if (key === 'needs review') return 'pill-review';
  if (key === 'in progress' || key === 'acknowledged' || key === 'dispatched') return 'pill-progress';
  if (HISTORICAL_STATUSES.has(status)) return 'pill-attended';
  return 'pill-neutral';
}

function categoryOf(report) {
  return getCategoryLabel(
    report.category ?? report.issue_category ?? report.user_selected_category ?? report.ai_category
  );
}

function isUnassignedOrMisallocated(report) {
  return isNullish(report.assigned_organization_id)
    || (!isNullish(report.recommended_organization_id)
      && report.assigned_organization_id !== report.recommended_organization_id);
}

function isNullish(value) {
  return value === null || value === undefined;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))]
    .map((value) => String(value).trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function makeSelect(placeholder, values) {
  const select = document.createElement('select');
  select.className = 'sheet-select';
  select.setAttribute('aria-label', placeholder);
  addOption(select, '', placeholder);
  for (const value of values) addOption(select, value, value);
  return select;
}

function addOption(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function makeButton(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-button';
  button.textContent = label;
  return button;
}

function coordinate(primary, fallback) {
  const value = primary ?? fallback;
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateOnly(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toISOString().slice(0, 10);
}
