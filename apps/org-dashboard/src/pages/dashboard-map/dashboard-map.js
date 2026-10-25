import * as L from '../../../../platform-admin/vendor/leaflet/leaflet-src.esm.js';
import { listReports } from '../../features/reports/reports.client.js';
import { reportsForTab } from '../../features/reports/report-filters.js';
import { navigate } from '../../router.js';

const HISTORICAL_STATUSES = new Set(['Resolved', 'Rejected', 'Duplicate']);

export async function mountDashboard(target, { context }) {
  target.replaceChildren();
  try {
    const reports = await listReports(context.organization.id);
    if (!target.isConnected) return;
    const page = document.createElement('div');
    page.className = 'org-dashboard-page';
    const summary = document.createElement('section');
    summary.className = 'org-grid';
    summary.append(
      metricCard('Active reports', reportsForTab(reports, 'active').length),
      metricCard('Historical reports', reportsForTab(reports, 'historical').length),
      metricCard('Organisation', context.organization.name)
    );
    const mapCard = document.createElement('section');
    mapCard.className = 'org-card';
    const mapTitle = document.createElement('h2');
    mapTitle.textContent = 'Active report map';
    const mapDescription = document.createElement('p');
    mapDescription.className = 'org-muted';
    mapDescription.textContent = 'Map markers and counts use reports currently assigned to this organisation.';
    const mapElement = document.createElement('div');
    mapElement.className = 'org-map';
    mapElement.setAttribute('aria-label', 'Map of active organisation reports');
    mapCard.append(mapTitle, mapDescription, mapElement);
    if (reports.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'org-empty';
      empty.textContent = 'No reports have been assigned to this organisation yet.';
      mapCard.append(empty);
    } else {
      renderMap(mapElement, reportsForTab(reports, 'active'));
    }

    const recent = document.createElement('section');
    recent.className = 'org-card';
    const recentTitle = document.createElement('h2');
    recentTitle.textContent = 'Recent reports';
    recent.append(recentTitle, reportList(reports.slice(0, 5)));
    const reportLink = document.createElement('a');
    reportLink.href = '#/report-sheet';
    reportLink.textContent = 'Open report sheet';
    recent.append(reportLink);
    page.append(summary, mapCard, recent);
    target.append(page);
  } catch (error) {
    showError(target, error);
  }
}

function metricCard(label, value) {
  const card = document.createElement('section');
  card.className = 'org-card org-metric';
  const title = document.createElement('h2');
  title.textContent = String(value);
  const description = document.createElement('p');
  description.textContent = label;
  card.append(title, description);
  return card;
}

function reportList(reports) {
  const list = document.createElement('ul');
  list.className = 'org-report-list';
  if (!reports.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No recent reports.';
    list.append(empty);
    return list;
  }
  for (const report of reports) {
    const item = document.createElement('li');
    const open = document.createElement('a');
    open.href = `#/report-detail/${encodeURIComponent(report.id)}`;
    open.textContent = `${report.tracking_number || 'Report'} · ${report.status}`;
    open.addEventListener('click', (event) => {
      event.preventDefault();
      navigate('report-detail', report.id);
    });
    item.append(open);
    list.append(item);
  }
  return list;
}

function reportCoordinates(report) {
  const latitudeValue = report.latitude ?? report.location_lat;
  const longitudeValue = report.longitude ?? report.location_lng;
  if (latitudeValue === null || latitudeValue === undefined || latitudeValue === ''
    || longitudeValue === null || longitudeValue === undefined || longitudeValue === '') return null;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return [latitude, longitude];
}

function renderMap(target, reports) {
  if (!target.isConnected) return;
  const located = reports.map((report) => ({ report, point: reportCoordinates(report) }))
    .filter((item) => item.point);
  if (!located.length) {
    const empty = document.createElement('p');
    empty.className = 'org-empty';
    empty.textContent = 'There are no active reports with valid coordinates to display.';
    target.append(empty);
    return;
  }
  const map = L.map(target, { scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  const markers = [];
  for (const { report, point } of located) {
    const marker = L.marker(point).addTo(map);
    const popup = document.createElement('span');
    popup.textContent = `${report.tracking_number || 'Report'} · ${report.status}`;
    marker.bindPopup(popup);
    markers.push(marker);
  }
  map.fitBounds(L.featureGroup(markers).getBounds().pad(0.15), { maxZoom: 15 });
  const active = reports.filter((report) => !HISTORICAL_STATUSES.has(report.status));
  if (!active.length) {
    target.classList.add('org-map-empty');
  }
}

function showError(target, error) {
  target.replaceChildren();
  const message = document.createElement('p');
  message.className = 'org-message';
  message.setAttribute('role', 'alert');
  message.textContent = error.message || 'Could not load organisation reports.';
  target.append(message);
}