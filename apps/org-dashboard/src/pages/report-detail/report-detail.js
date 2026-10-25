import * as L from '../../../../platform-admin/vendor/leaflet/leaflet-src.esm.js';
import {
  getReport,
  listAssignableOrganizations,
  listReportEvents,
  reassignReport,
  updateReport
} from '../../features/reports/reports.client.js';
import { navigate } from '../../router.js';

const STATUSES = [
  'Pending Dispatch',
  'Needs Review',
  'Dispatched',
  'Acknowledged',
  'In Progress',
  'Resolved',
  'Rejected',
  'Duplicate'
];

export async function mountReportDetail(target, { context, reportId }) {
  target.replaceChildren();
  if (!reportId) {
    renderMessage(target, 'Report not found. Return to the report sheet and select a report.', false);
    return;
  }
  try {
    const [report, events] = await Promise.all([getReport(reportId), listReportEvents(reportId)]);
    if (!target.isConnected) return;
    if (!report) {
      renderMessage(target, 'Report not found or not available to this organisation.', false);
      return;
    }
    const page = document.createElement('div');
    page.className = 'org-report-detail';
    const back = document.createElement('a');
    back.href = '#/report-sheet';
    back.textContent = 'Back to report sheet';
    const heading = document.createElement('h2');
    heading.textContent = report.tracking_number || 'Report detail';
    const summary = document.createElement('section');
    summary.className = 'org-card';
    summary.append(heading);
    appendField(summary, 'Status', report.status);
    appendField(summary, 'Category', report.category || report.issue_category || 'Not provided');
    appendField(summary, 'Urgency', report.urgency || report.report_level || 'Not provided');
    appendField(summary, 'Reported', formatDate(report.created_at));
    appendField(summary, 'Description', report.description_english || report.description_original || report.description || 'Not provided');
    appendField(summary, 'Location', report.location_name || report.user_reported_address || 'Not provided');
    page.append(back, summary);

    const statusCard = document.createElement('section');
    statusCard.className = 'org-card';
    const statusTitle = document.createElement('h3');
    statusTitle.textContent = 'Update status and internal note';
    const statusForm = document.createElement('form');
    statusForm.className = 'org-form';
    const statusLabel = document.createElement('label');
    statusLabel.textContent = 'Status';
    const statusSelect = document.createElement('select');
    statusSelect.name = 'status';
    for (const status of STATUSES) {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = status;
      option.selected = report.status === status;
      statusSelect.append(option);
    }
    statusLabel.append(statusSelect);
    const noteLabel = document.createElement('label');
    noteLabel.textContent = 'Internal note (visible to organisation staff)';
    const note = document.createElement('textarea');
    note.name = 'note';
    note.maxLength = 2000;
    noteLabel.append(note);
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'org-button';
    save.textContent = 'Save update';
    const feedback = document.createElement('p');
    feedback.setAttribute('aria-live', 'polite');
    statusForm.append(statusLabel, noteLabel, save, feedback);
    statusForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      save.disabled = true;
      feedback.textContent = '';
      try {
        await updateReport(report.id, statusSelect.value, note.value);
        navigate('report-detail', report.id);
      } catch (error) {
        feedback.textContent = error.code === '42501'
          ? 'Permission denied: your organisation membership cannot update this report.'
          : error.message || 'Could not update the report.';
        feedback.setAttribute('role', 'alert');
      } finally {
        save.disabled = false;
      }
    });
    statusCard.append(statusTitle, statusForm);
    page.append(statusCard);

    const assignment = document.createElement('section');
    assignment.className = 'org-card';
    assignment.append(createAssignmentPanel(report, context.role));
    page.append(assignment);
    page.append(renderTimeline(events));
    const locationCard = renderLocation(report);
    if (locationCard) page.append(locationCard);
    target.append(page);
  } catch (error) {
    renderMessage(
      target,
      error.code === '42501'
        ? 'Permission denied: this report is not available to your organisation.'
        : error.message || 'Could not load report details.',
      true
    );
  }
}

function createAssignmentPanel(report, role) {
  const panel = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = 'Reassign organisation';
  panel.append(title);
  if (role !== 'org_admin') {
    const denied = document.createElement('p');
    denied.className = 'org-message';
    denied.setAttribute('role', 'status');
    denied.textContent = 'Permission denied: only organisation administrators can reassign reports.';
    panel.append(denied);
    return panel;
  }
  const form = document.createElement('form');
  form.className = 'org-form';
  const orgLabel = document.createElement('label');
  orgLabel.textContent = 'Approved organisation';
  const select = document.createElement('select');
  select.required = true;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose an organisation';
  select.append(placeholder);
  const noteLabel = document.createElement('label');
  noteLabel.textContent = 'Internal note (optional)';
  const note = document.createElement('textarea');
  note.maxLength = 2000;
  noteLabel.append(note);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'org-button secondary';
  submit.textContent = 'Reassign';
  const feedback = document.createElement('p');
  feedback.setAttribute('aria-live', 'polite');
  orgLabel.append(select);
  form.append(orgLabel, noteLabel, submit, feedback);
  void listAssignableOrganizations().then((organizations) => {
    for (const organization of organizations) {
      if (organization.id === report.assigned_organization_id) continue;
      const option = document.createElement('option');
      option.value = organization.id;
      option.textContent = organization.name;
      select.append(option);
    }
    if (select.options.length === 1) {
      select.disabled = true;
      submit.disabled = true;
      feedback.textContent = 'No other approved organisation is available.';
    }
  }).catch((error) => {
    select.disabled = true;
    submit.disabled = true;
    feedback.textContent = error.message || 'Could not load approved organisations.';
    feedback.setAttribute('role', 'alert');
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!select.value) return;
    submit.disabled = true;
    feedback.textContent = '';
    try {
      await reassignReport(report.id, select.value, note.value);
      navigate('report-detail', report.id);
    } catch (error) {
      feedback.textContent = error.code === '42501'
        ? 'Permission denied: only organisation administrators can reassign reports.'
        : error.message || 'Could not reassign the report.';
      feedback.setAttribute('role', 'alert');
      submit.disabled = false;
    }
  });
  panel.append(form);
  return panel;
}

function renderTimeline(events) {
  const section = document.createElement('section');
  section.className = 'org-card';
  const title = document.createElement('h3');
  title.textContent = 'Report history and internal notes';
  const list = document.createElement('ul');
  list.className = 'org-timeline';
  if (!events.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No report history is available yet.';
    list.append(empty);
  }
  for (const event of events) {
    const item = document.createElement('li');
    const description = document.createElement('strong');
    description.textContent = event.note || event.event_type.replaceAll('_', ' ');
    const date = document.createElement('time');
    date.dateTime = event.created_at;
    date.textContent = formatDate(event.created_at);
    item.append(description, date);
    list.append(item);
  }
  section.append(title, list);
  return section;
}

function renderLocation(report) {
  const point = coordinates(report);
  if (!point) return null;
  const card = document.createElement('section');
  card.className = 'org-card';
  const title = document.createElement('h3');
  title.textContent = 'Report location';
  const map = document.createElement('div');
  map.className = 'org-map org-detail-map';
  card.append(title, map);
  const instance = L.map(map, { scrollWheelZoom: false }).setView(point, 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(instance);
  L.marker(point).addTo(instance);
  return card;
}

function coordinates(report) {
  const latitude = report.latitude ?? report.location_lat;
  const longitude = report.longitude ?? report.location_lng;
  if (latitude === null || latitude === undefined || latitude === ''
    || longitude === null || longitude === undefined || longitude === '') return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)
    || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

function appendField(target, label, value) {
  const row = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  const text = document.createTextNode(String(value));
  row.append(strong, text);
  target.append(row);
}

function formatDate(value) {
  if (!value) return 'Not provided';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleString();
}

function renderMessage(target, text, isError) {
  const message = document.createElement('p');
  message.className = 'org-message';
  message.setAttribute('role', isError ? 'alert' : 'status');
  message.textContent = text;
  target.append(message);
}