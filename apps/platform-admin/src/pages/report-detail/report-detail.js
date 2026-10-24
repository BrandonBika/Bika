import * as L from '../../../vendor/leaflet/leaflet-src.esm.js';
import { createEmptyState, createRetryState } from '../../components/state-message/state-message.js';
import { MAP_CONFIG } from '../../config.js';
import { attachTileErrorNotice } from '../../features/map-tiles.js';
import { getReportDetailData, reassignReport } from '../../features/reports.client.js';
import { getCategoryLabel, getEventLabel, getStatusLabel } from '../../features/status-labels.js';

export async function mountReportDetail(target, reportId) {
  target.replaceChildren();
  try {
    const data = await getReportDetailData(reportId);
    if (!target.isConnected) return;
    if (!data) {
      target.replaceChildren(createEmptyState({
        title: 'Report not found',
        message: 'This report may have been removed or the link may be incorrect.'
      }));
      return;
    }
    renderDetail(target, data);
  } catch (error) {
    target.replaceChildren(createRetryState({
      title: 'No access: check your staff account',
      message: error.message,
      onRetry: () => mountReportDetail(target, reportId)
    }));
  }
}

function renderDetail(target, data, notice = '') {
  const { report } = data;
  const page = document.createElement('div');
  page.className = 'report-detail-page';
  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '#/report-sheet';
  back.textContent = '← Report sheet';
  page.append(back);

  const header = document.createElement('section');
  header.className = 'detail-header';
  const title = document.createElement('h2');
  title.textContent = report.tracking_number || 'Report detail';
  const status = document.createElement('span');
  status.className = 'status-pill';
  status.textContent = getStatusLabel(report.status);
  status.title = String(report.status ?? '');
  header.append(title, status);
  page.append(header);
  if (notice) {
    const feedback = document.createElement('p');
    feedback.className = 'inline-success';
    feedback.setAttribute('role', 'status');
    feedback.textContent = notice;
    page.append(feedback);
  }

  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  const summary = makeCard('Report');
  addField(summary, 'Reporter', report.reporter_name || (report.reporter_type === 'guest' ? 'Guest' : 'Anonymous'));
  addField(summary, 'Urgency', report.urgency);
  addField(summary, 'Source', report.source);
  addField(summary, 'Reported', formatDate(report.created_at));
  addField(summary, 'Description', report.description_original);
  addField(summary, 'English description', report.description_english);
  addField(summary, 'Original transcription', report.original_transcription);
  addField(summary, 'Location name', report.location_name);
  addField(summary, 'Address', report.user_reported_address);
  addField(summary, 'GPS status', report.gps_status);
  const categories = makeCard('Categories');
  addField(categories, 'Display category', categoryOf(report));
  addCategoryField(categories, 'Category', report.category);
  addCategoryField(categories, 'Issue category', report.issue_category);
  addCategoryField(categories, 'User-selected category', report.user_selected_category);
  addCategoryField(categories, 'AI category', report.ai_category);
  const organizations = makeCard('Organisation routing');
  addField(organizations, 'Assigned organisation', data.assignedOrganization?.name || (
    report.assigned_organization_id ? 'Organisation unavailable' : 'Unassigned'
  ));
  addField(organizations, 'Recommended organisation', data.recommendedOrganization?.name || recommendedName(report));
  grid.append(summary, categories, organizations);
  page.append(grid);

  const contact = makeCard('Reporter contact');
  const contactData = data.guestContact ?? data.residentProfile;
  if (!contactData) {
    contact.append(createEmptyState({ title: 'No contact details', message: 'No linked reporter contact is available.' }));
  } else {
    addField(contact, 'Name', contactData.full_name || [contactData.first_name, contactData.last_name].filter(Boolean).join(' '));
    addField(contact, 'Phone', contactData.phone);
    addField(contact, 'Email', contactData.email);
    addField(contact, 'Contact preference', contactData.contact_preference);
  }
  page.append(contact);
  page.append(createLocationCard(report));
  page.append(createEvidenceCard(report, data.evidence));
  page.append(createReassignCard(data, report, (updated) => {
    renderDetail(target, updated, 'Organisation reassigned.');
  }));
  page.append(createTimelineCard(data.events, data.organizations));
  target.replaceChildren(page);
}

function createReassignCard(data, report, onSuccess) {
  const card = makeCard('Reassign organisation');
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Assign report to an organisation');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = data.organizations.length ? 'Choose an organisation' : 'No organisations yet';
  select.append(placeholder);
  for (const organization of data.organizations) {
    const option = document.createElement('option');
    option.value = organization.id;
    option.textContent = organization.name;
    select.append(option);
  }
  select.disabled = data.organizations.length === 0;
  const note = document.createElement('textarea');
  note.placeholder = 'Optional note';
  note.setAttribute('aria-label', 'Optional reassignment note');
  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'primary-button';
  submit.textContent = 'Reassign';
  submit.disabled = data.organizations.length === 0;
  const feedback = document.createElement('p');
  feedback.className = 'form-feedback';
  feedback.setAttribute('aria-live', 'polite');
  submit.addEventListener('click', async () => {
    if (!select.value) {
      feedback.textContent = 'Choose an organisation first.';
      return;
    }
    submit.disabled = true;
    feedback.textContent = '';
    try {
      await reassignReport(report.id, select.value, note.value);
      const updated = await getReportDetailData(report.id);
      if (!updated) throw new Error('Report not found after reassignment.');
      onSuccess(updated);
    } catch (error) {
      console.error('Report reassignment failed.', error);
      if (error.name === 'RequestTimeoutError') {
        const retryState = createRetryState({
          title: 'Reassignment timed out',
          message: error.message,
          onRetry: () => {
            retryState.replaceWith(feedback);
            submit.click();
          }
        });
        feedback.replaceWith(retryState);
        submit.disabled = data.organizations.length === 0;
        return;
      }
      feedback.textContent = error.message === 'No access: check your staff account'
        ? error.message
        : cleanRpcError(error.message);
      submit.disabled = data.organizations.length === 0;
    }
  });
  if (!data.organizations.length) {
    const empty = document.createElement('p');
    empty.className = 'muted-note';
    empty.textContent = 'No organisations yet';
    submit.disabled = true;
    card.append(select, submit, empty);
  } else {
    card.append(select, note, submit, feedback);
  }
  return card;
}

function createLocationCard(report) {
  const card = makeCard('Location');
  const latitude = coordinate(report.latitude, report.location_lat);
  const longitude = coordinate(report.longitude, report.location_lng);
  if (latitude === null || longitude === null) {
    card.append(createEmptyState({ title: 'No coordinates', message: 'This report has no map location.' }));
    return card;
  }
  addField(card, 'Latitude', latitude);
  addField(card, 'Longitude', longitude);
  const map = document.createElement('div');
  map.className = 'detail-map';
  map.setAttribute('aria-label', 'Report location map');
  card.append(map);
  void renderDetailMap(map, latitude, longitude);
  return card;
}

async function renderDetailMap(container, latitude, longitude) {
  try {
    window.L = L;
    if (!container.isConnected) return;
    const map = L.map(container, { scrollWheelZoom: false, zoomControl: false })
      .setView([latitude, longitude], MAP_CONFIG.defaultZoom);
    const tileLayer = L.tileLayer(MAP_CONFIG.tileUrlTemplate, {
      maxZoom: MAP_CONFIG.maxZoom,
      attribution: MAP_CONFIG.attribution
    });
    attachTileErrorNotice(tileLayer, container);
    tileLayer.addTo(map);
    L.circleMarker([latitude, longitude], { radius: 8, color: '#b45309', fillOpacity: 0.85 }).addTo(map);
    requestAnimationFrame(() => {
      if (container.isConnected) map.invalidateSize();
    });
  } catch (error) {
    console.error('Could not load the report location map.', error);
    if (container.isConnected) {
      const retryState = createRetryState({
        title: 'Map could not be loaded',
        message: error.message || 'Check your connection and reload this report.',
        onRetry: () => {
          const retryMap = document.createElement('div');
          retryMap.className = 'detail-map';
          retryMap.setAttribute('aria-label', 'Report location map');
          retryState.replaceWith(retryMap);
          void renderDetailMap(retryMap, latitude, longitude);
        }
      });
      container.replaceWith(retryState);
    }
  }
}

function createEvidenceCard(report, evidence) {
  const card = makeCard('Evidence');
  const list = document.createElement('ul');
  list.className = 'evidence-list';
  for (const item of evidence) {
    const row = document.createElement('li');
    if (item.signedUrl) row.append(makeSafeLink(item.kind || 'Evidence', item.signedUrl));
    else row.textContent = `${item.kind || 'Evidence'} (link unavailable)`;
    if (item.mime_type) row.append(document.createTextNode(` · ${item.mime_type}`));
    list.append(row);
  }
  for (const key of ['media_url', 'audio_url', 'image_url']) {
    if (!report[key]) continue;
    const row = document.createElement('li');
    row.append(makeSafeLink(key.replace('_url', ''), report[key]));
    list.append(row);
  }
  if (!list.children.length) {
    card.append(createEmptyState({ title: 'No evidence attached', message: 'No evidence files are available for this report.' }));
  } else {
    card.append(list);
  }
  return card;
}

function createTimelineCard(events, organizations) {
  const card = makeCard('Activity timeline');
  if (!events.length) {
    card.append(createEmptyState({ title: 'No events yet', message: 'Report activity will appear here when recorded.' }));
    return card;
  }
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization.name]));
  const list = document.createElement('ol');
  list.className = 'event-timeline';
  for (const event of events) {
    const entry = document.createElement('li');
    const eventTitle = document.createElement('strong');
    eventTitle.textContent = getEventLabel(event.event_type);
    const timestamp = document.createElement('time');
    timestamp.dateTime = event.created_at || '';
    timestamp.textContent = formatDate(event.created_at);
    entry.append(eventTitle, timestamp);
    const transition = [
      event.from_organization_id ? organizationById.get(event.from_organization_id) || 'Previous organisation' : '',
      event.to_organization_id ? organizationById.get(event.to_organization_id) || 'New organisation' : ''
    ].filter(Boolean);
    if (transition.length) {
      const detail = document.createElement('p');
      detail.textContent = transition.join(' → ');
      entry.append(detail);
    }
    if (event.note) {
      const noteText = document.createElement('p');
      noteText.textContent = event.note;
      entry.append(noteText);
    }
    list.append(entry);
  }
  card.append(list);
  return card;
}

function makeCard(title) {
  const card = document.createElement('section');
  card.className = 'detail-card';
  const heading = document.createElement('h2');
  heading.textContent = title;
  card.append(heading);
  return card;
}

function addField(card, label, value) {
  const field = document.createElement('div');
  field.className = 'detail-field';
  const name = document.createElement('span');
  name.className = 'detail-field-label';
  name.textContent = label;
  const text = document.createElement('span');
  text.className = 'detail-field-value';
  text.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
  field.append(name, text);
  card.append(field);
}

function addCategoryField(card, label, value) {
  addField(card, label, value === null || value === undefined || value === ''
    ? value
    : getCategoryLabel(value));
}

function recommendedName(report) {
  const value = report.recommended_organization;
  if (typeof value === 'string') return value;
  return value?.organization_name ?? report.recommended_organization_text ?? '—';
}

function categoryOf(report) {
  return getCategoryLabel(
    report.category ?? report.issue_category ?? report.user_selected_category ?? report.ai_category
  );
}

function makeSafeLink(label, rawUrl) {
  const link = document.createElement('a');
  link.textContent = label;
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported link protocol');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  } catch {
    link.setAttribute('aria-disabled', 'true');
  }
  return link;
}

function cleanRpcError(message = '') {
  if (/already assigned/i.test(message)) return 'This report is already assigned to that organisation.';
  if (/inactive/i.test(message)) return 'That organisation is inactive and cannot receive reports.';
  if (/organization not found/i.test(message)) return 'That organisation could not be found.';
  if (/report not found/i.test(message)) return 'This report could not be found.';
  if (/assignment event|trigger/i.test(message)) return 'The reassignment was not recorded. Contact a Platform Admin.';
  return 'Could not reassign this report. Please try again.';
}

function coordinate(primary, fallback) {
  const value = primary ?? fallback;
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}