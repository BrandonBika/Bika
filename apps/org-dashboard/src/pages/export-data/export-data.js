import { toCsv } from '../../../../../packages/security-web/src/csv-safe.js';
import { listReports } from '../../features/reports/reports.client.js';

const columns = [
  ['tracking_number', 'Tracking number'],
  ['status', 'Status'],
  ['category', 'Category'],
  ['description_english', 'Description'],
  ['created_at', 'Reported at'],
  ['latitude', 'Latitude'],
  ['longitude', 'Longitude']
];

export async function mountExportData(target, { context }) {
  target.replaceChildren();
  let reports;
  try {
    reports = await listReports(context.organization.id);
  } catch (error) {
    renderMessage(target, error.message || 'Could not load organisation reports for export.', true);
    return;
  }
  if (!target.isConnected) return;
  const card = document.createElement('section');
  card.className = 'org-card';
  const heading = document.createElement('h2');
  heading.textContent = 'Organisation reports';
  const description = document.createElement('p');
  description.textContent = 'Exports contain only reports visible to your signed-in organisation account.';
  const csv = document.createElement('button');
  csv.type = 'button';
  csv.className = 'org-button';
  csv.textContent = 'Download CSV';
  csv.addEventListener('click', () => {
    download(
      `bika-organisation-reports-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(reports.map((report) => columns.map(([key]) => report[key])), columns.map(([, label]) => label)),
      'text/csv;charset=utf-8'
    );
  });
  const geojson = document.createElement('button');
  geojson.type = 'button';
  geojson.className = 'org-button secondary';
  geojson.textContent = 'Download GeoJSON';
  geojson.addEventListener('click', () => {
    const features = reports.flatMap((report) => {
      const point = coordinates(report);
      if (!point) return [];
      return [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [point[1], point[0]] },
        properties: {
          tracking_number: report.tracking_number,
          status: report.status,
          category: report.category || report.issue_category || report.user_selected_category
        }
      }];
    });
    download(
      `bika-organisation-reports-${new Date().toISOString().slice(0, 10)}.geojson`,
      JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
      'application/geo+json'
    );
  });
  const note = document.createElement('p');
  note.className = 'org-muted';
  note.textContent = `${reports.length} report${reports.length === 1 ? '' : 's'} available. GeoJSON includes only reports with valid coordinates.`;
  card.append(heading, description, csv, geojson, note);
  target.append(card);
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

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderMessage(target, text, isError) {
  const message = document.createElement('p');
  message.className = 'org-message';
  message.setAttribute('role', isError ? 'alert' : 'status');
  message.textContent = text;
  target.append(message);
}