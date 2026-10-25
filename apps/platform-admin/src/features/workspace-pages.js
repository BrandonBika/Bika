import { supabase } from './supabase.client.js';
import { updatePassword } from './auth/auth.client.js';
import { toCsv } from '../../../../packages/security-web/src/csv-safe.js';
import { withTimeout } from './with-timeout.js';
import { getReportSheetData } from './reports.client.js';

const titles = {
  'organisation-approvals': ['Organisation approvals', 'Review applications before an organisation can receive reports.'],
  posts: ['Posts', 'Publish updates for communities and member organisations.'],
  surveys: ['Surveys', 'Create surveys and review responses.'],
  analytics: ['Analytics', 'Platform-wide reporting and service trends.'],
  'export-data': ['Export data', 'Download platform data for approved operational use.'],
  'my-profile': ['My profile', 'Manage your account and support preferences.'],
  'pilot-mode': ['Pilot mode', 'Manage demo organisations and pilot behaviour.'],
  'platform-activity': ['Platform activity', 'Review recent notifications and administrative events.'],
  chat: ['Chat', 'Read resident conversations opened from a report.'],
  'manage-profiles': ['Manage profiles', 'Manage platform employee access.'],
  'system-settings': ['System settings', 'Configure platform defaults and security preferences.'],
  'platform-team': ['Platform team', 'Invite and manage platform staff access.']
};

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}

function button(label, onClick, kind = '') {
  const node = el('button', label, `workspace-button ${kind}`.trim());
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function cell(row, value) {
  const td = row.insertCell();
  td.textContent = value == null || value === '' ? '—' : String(value);
  return td;
}

function table(headers, rows) {
  const wrap = el('div', undefined, 'workspace-table-wrap');
  const node = document.createElement('table');
  node.className = 'workspace-table';
  const head = node.createTHead().insertRow();
  for (const label of headers) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    head.append(th);
  }
  const body = node.createTBody();
  for (const values of rows) {
    const tr = body.insertRow();
    for (const value of values) {
      if (value instanceof Node) {
        const td = tr.insertCell();
        td.append(value);
      } else cell(tr, value);
    }
  }
  wrap.append(node);
  return wrap;
}

function statusPill(value) {
  return el('span', value, `workspace-pill ${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
}

function card(title, content) {
  const node = el('section', undefined, 'workspace-card');
  if (title) node.append(el('h2', title, 'workspace-card-title'));
  if (content) node.append(content);
  return node;
}

function emptyState(title, message) {
  const node = el('div', undefined, 'workspace-empty');
  node.append(el('strong', title), el('p', message));
  return node;
}

function tabs(labels, selected, onSelect) {
  const node = el('div', undefined, 'workspace-tabs');
  node.setAttribute('role', 'tablist');
  for (const label of labels) {
    const tab = button(label, () => onSelect(label), selected === label ? 'selected' : '');
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(selected === label));
    node.append(tab);
  }
  return node;
}

function toast(target, message, error = false) {
  target.querySelector('.workspace-toast')?.remove();
  const node = el('div', message, `workspace-toast${error ? ' error' : ''}`);
  node.setAttribute('role', error ? 'alert' : 'status');
  target.append(node);
  setTimeout(() => node.remove(), 4500);
}

function modal(target, title, content, onClose) {
  const dialog = document.createElement('dialog');
  dialog.className = 'workspace-modal';
  const heading = el('h2', title);
  const close = button('Close', () => {
    dialog.close();
    dialog.remove();
    onClose?.();
  }, 'quiet');
  const bar = el('div', undefined, 'workspace-modal-head');
  bar.append(heading, close);
  dialog.append(bar, content);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close.click();
  });
  target.append(dialog);
  dialog.showModal();
  return dialog;
}

function header(route, target) {
  const [title, subtitle] = titles[route];
  const node = el('header', undefined, 'workspace-header');
  const text = el('div');
  text.append(el('h1', title), el('p', subtitle));
  node.append(text);
  target.append(node);
}

function downloadCsv(filename, headings, rows) {
  const csv = toCsv(rows, headings);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = el('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadApprovals(target) {
  const { data, error } = await withTimeout(
    supabase.from('organizations')
      .select('id,name,type,jurisdiction_level,province,municipality,created_at,status')
      .order('created_at', { ascending: false }),
    'Organisation applications query'
  );
  if (error) throw error;
  return data || [];
}

function renderApprovals(target, initial) {
  let selectedTab = 'Pending';
  const content = el('div');
  const render = () => {
    content.replaceChildren();
    content.append(tabs(['Pending', 'All member organisations'], selectedTab, (value) => {
      selectedTab = value;
      render();
    }));
    const rows = initial.filter((org) => selectedTab === 'Pending'
      ? org.status === 'pending'
      : ['approved', 'rejected'].includes(org.status));
    if (rows.length === 0) {
      content.append(emptyState(
        'No applications waiting',
        selectedTab === 'Pending' ? 'New organisation applications will appear here.' : 'No reviewed organisations yet.'
      ));
      return;
    }
    const bodyRows = rows.map((org) => {
      const reviewButtons = el('div', undefined, 'workspace-actions');
      reviewButtons.append(button('View application', () => {
        const details = el('div', undefined, 'workspace-details');
        for (const [label, value] of [
          ['Name', org.name], ['Type', org.type],
          ['Operating area', [org.municipality, org.province, org.jurisdiction_level].filter(Boolean).join(', ')],
          ['Contact', 'Not provided'], ['Submitted', new Date(org.created_at).toLocaleDateString()]
        ]) details.append(el('p', `${label}: ${value || '—'}`));
        modal(target, 'Organisation application', details);
      }));
      if (org.status === 'pending') {
        reviewButtons.append(
          button('Reject', () => void review(org, 'rejected'), 'danger'),
          button('Approve organisation', () => void review(org, 'approved'), 'primary')
        );
      }
      async function review(item, status) {
        try {
          const { error } = await withTimeout(
            supabase.functions.invoke('orgs-approve', {
              body: { organization_id: item.id, status }
            }),
            'Organisation review request'
          );
          if (error) throw error;
          item.status = status;
          toast(target, `Organisation ${status}.`);
          render();
        } catch (error) {
          toast(target, error.message || `Could not ${status} organisation.`, true);
        }
      }
      return [org.name, org.type, [org.municipality, org.province, org.jurisdiction_level].filter(Boolean).join(', '), 'Not provided',
        new Date(org.created_at).toLocaleDateString(), statusPill(org.status === 'pending' ? 'Pending review' : org.status), reviewButtons];
    });
    content.append(table(['Organisation', 'Type', 'Operating area', 'Contact', 'Submitted', 'Status', 'Actions'], bodyRows));
  };
  render();
  target.append(card('', content));
}

function renderPosts(target) {
  target.append(emptyState(
    'Posts not available yet',
    'There is no real posts data source configured. Post creation is unavailable.'
  ));
}

function renderSurveys(target) {
  target.append(emptyState(
    'Surveys not available yet',
    'There is no real surveys or polls data source configured. Survey creation is unavailable.'
  ));
}

async function renderAnalytics(target) {
  const { data, error } = await supabase.from('reports')
    .select('status,category,created_at,updated_at');
  if (error) throw error;
  const reports = data || [];
  const resolved = reports.filter((r) => String(r.status).toLowerCase() === 'resolved');
  const durations = resolved.map((r) => Date.parse(r.updated_at) - Date.parse(r.created_at))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const avgHours = durations.length ? (durations.reduce((sum, value) => sum + value, 0) / durations.length / 3600000).toFixed(1) : '—';
  const activeUsers = el('span', 'Not available');
  const metrics = [
    ['Total reports', reports.length],
    ['Resolved', resolved.length],
    ['Avg resolution time (hours)', avgHours],
    ['Active users', activeUsers]
  ];
  const grid = el('div', undefined, 'workspace-kpis');
  for (const [label, value] of metrics) {
    const item = el('div', undefined, 'workspace-kpi');
    item.append(el('span', label), el('strong', value));
    grid.append(item);
  }
  const counts = new Map();
  reports.forEach((r) => counts.set(r.category || 'Uncategorised', (counts.get(r.category || 'Uncategorised') || 0) + 1));
  const chart = el('div', undefined, 'workspace-bars');
  const max = Math.max(1, ...counts.values());
  for (const [label, count] of counts) {
    const row = el('div', undefined, 'workspace-bar-row');
    row.append(el('span', label));
    const track = el('div', undefined, 'workspace-bar-track');
    const bar = el('div', undefined, 'workspace-bar');
    bar.style.width = `${(count / max) * 100}%`;
    track.append(bar);
    row.append(track, el('strong', count));
    chart.append(row);
  }
  target.append(card('Platform overview', grid), card('Reports by category', chart));
}

function downloadGeoJson(filename, reports) {
  const features = reports.filter((report) => Number.isFinite(Number(report.longitude))
    && Number.isFinite(Number(report.latitude)))
    .map((report) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(report.longitude), Number(report.latitude)] },
      properties: { tracking_number: report.tracking_number, category: report.category, status: report.status }
    }));
  const url = URL.createObjectURL(new Blob([JSON.stringify({ type: 'FeatureCollection', features })], {
    type: 'application/geo+json'
  }));
  const link = el('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printReports(reports) {
  const frame = document.createElement('iframe');
  frame.title = 'Printable report sheet';
  Object.assign(frame.style, {
    position: 'fixed',
    width: '1px',
    height: '1px',
    opacity: '0',
    border: '0',
    pointerEvents: 'none'
  });
  document.body.append(frame);
  const printWindow = frame.contentWindow;
  if (!printWindow) {
    frame.remove();
    throw new Error('The report sheet could not be prepared for printing.');
  }
  const title = printWindow.document.createElement('h1');
  title.textContent = 'Bika report sheet export';
  printWindow.document.body.append(title);
  const listing = printWindow.document.createElement('pre');
  listing.textContent = reports.map((report) => [
    report.tracking_number, report.category, report.status, report.description
  ].filter(Boolean).join(' | ')).join('\n');
  printWindow.document.body.append(listing);
  printWindow.focus();
  printWindow.print();
  setTimeout(() => frame.remove(), 1000);
}

function renderExports(target) {
  const cards = [
    ['Map view', ['GeoJSON', 'CSV']],
    ['Report sheet', ['CSV', 'PDF']]
  ];
  for (const [name, formats] of cards) {
    const actions = el('div', undefined, 'workspace-actions');
    for (const format of formats) {
      actions.append(button(`${format} export`, () => {
        void (async () => {
          try {
            if (name === 'Map view' || name === 'Report sheet') {
              const { reports } = await getReportSheetData();
              if (name === 'Map view' && format === 'GeoJSON') {
                downloadGeoJson('map-view.geojson', reports);
              } else if (format === 'PDF') {
                printReports(reports);
              } else {
                const columns = ['tracking_number', 'category', 'status', 'description', 'created_at'];
                downloadCsv(`${name.toLowerCase().replaceAll(' ', '-')}.csv`, columns,
                  reports.map((report) => columns.map((column) => report[column])));
              }
            }
          } catch (error) {
            toast(target, error.message || 'Export failed.', true);
          }
        })();
      }));
    }
    target.append(card(name, actions));
  }
  target.append(
    card('Surveys', emptyState('Not available yet', 'There is no real surveys data source to export.')),
    card('Polls', emptyState('Not available yet', 'There is no real polls data source to export.'))
  );
}

function renderProfile(target, staff, onSignOut) {
  const details = el('div', undefined, 'workspace-details');
  details.append(el('p', `Name: ${staff.fullName || '—'}`), el('p', `Email: ${staff.email || '—'}`), el('p', `Role: ${staff.role}`));
  target.append(card('Account', details));
  target.append(button('Change password', () => {
    const form = document.createElement('form');
    form.className = 'workspace-form';
    const label = el('label', 'New password');
    const input = document.createElement('input');
    input.type = 'password';
    input.required = true;
    input.minLength = 8;
    label.append(input);
    form.append(label);
    const submit = button('Update password', async () => {
      if (!form.reportValidity()) return;
      try {
        await updatePassword(input.value);
        toast(target, 'Password updated.');
        form.closest('dialog')?.close();
      } catch (error) { toast(target, error.message, true); }
    }, 'primary');
    form.append(submit);
    modal(target, 'Change password', form);
  }));
  for (const [title, text] of [
    ['Help & support', 'For assistance, contact your platform administrator.'],
    ['Legal & privacy', 'Privacy Policy, Terms, and Data Processing Agreement are placeholders pending approved legal copy.']
  ]) target.append(button(title, () => modal(target, title, el('p', text))));
  target.append(button('Sign out', onSignOut, 'danger'));
}

function renderPilot(target) {
  target.append(emptyState(
    'Pilot controls not available yet',
    'No real pilot-mode settings or pilot organisation workflow is configured.'
  ));
}

async function renderActivity(target, role) {
  if (role !== 'platform_admin') {
    target.append(emptyState(
      'No access',
      'The organisation status audit is restricted to Platform Admins by database policy.'
    ));
    return;
  }
  const { data, error } = await withTimeout(
    supabase.from('organization_status_audit')
      .select('changed_at,actor_id,organization_id,old_status,new_status')
      .order('changed_at', { ascending: false }),
    'Platform audit log query'
  );
  if (error) throw error;
  const activity = (data || []).map((row) => ({
    time: row.changed_at,
    actor: row.actor_id,
    action: `organization.${row.old_status}_to_${row.new_status}`,
    target: row.organization_id
  }));
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Filter by action type');
  ['', ...new Set(activity.map((row) => row.action))].forEach((value) => {
    const option = el('option', value || 'All action types');
    option.value = value;
    select.append(option);
  });
  const listing = el('div');
  const render = () => {
    const rows = activity.filter((row) => !select.value || row.action === select.value);
    listing.replaceChildren(rows.length
      ? table(['Time', 'Actor', 'Action', 'Target'], rows.map((r) => [r.time, r.actor, r.action, r.target]))
      : emptyState('No activity', 'No rows match this action type.'));
  };
  select.addEventListener('change', render);
  target.append(select, listing);
  render();
}

function renderChat(target) {
  target.append(emptyState(
    'Chat not available yet',
    'Resident conversations are not connected to the platform staff inbox.'
  ));
}

function renderManageProfiles(target) {
  target.append(emptyState(
    'Not available yet',
    'Platform staff member lookup, invitations, and deactivation are not configured.'
  ));
}

function renderSettings(target) {
  target.append(emptyState(
    'System settings not available yet',
    'No real platform settings data source or save workflow is configured.'
  ));
}

function renderTeam(target) {
  target.append(emptyState(
    'Platform team not available yet',
    'No real platform team listing, invitation, or access-revocation workflow is configured.'
  ));
}

export async function mountWorkspacePage(route, target, { staff, onSignOut } = {}) {
  target.replaceChildren();
  header(route, target);
  try {
    if (route === 'organisation-approvals') renderApprovals(target, await loadApprovals(target));
    else if (route === 'posts') renderPosts(target);
    else if (route === 'surveys') renderSurveys(target);
    else if (route === 'analytics') await renderAnalytics(target);
    else if (route === 'export-data') renderExports(target);
    else if (route === 'my-profile') renderProfile(target, staff, onSignOut);
    else if (route === 'pilot-mode') renderPilot(target);
    else if (route === 'platform-activity') await renderActivity(target, staff?.role);
    else if (route === 'chat') renderChat(target);
    else if (route === 'manage-profiles') renderManageProfiles(target);
    else if (route === 'system-settings') renderSettings(target);
    else if (route === 'platform-team') renderTeam(target);
  } catch (error) {
    target.append(emptyState('Unable to load this page', error.message || 'The request failed.'));
  }
}
