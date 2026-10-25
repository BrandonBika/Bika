import { supabase } from './supabase.client.js';
import { updatePassword } from './auth/auth.client.js';
import { mockData } from '../mock-data.js';
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

const DEMO_PAGES = new Set([
  'posts', 'surveys', 'export-data', 'pilot-mode', 'platform-activity',
  'chat', 'manage-profiles', 'system-settings', 'platform-team'
]);

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

function header(route, target, staff) {
  const [title, subtitle] = titles[route];
  const node = el('header', undefined, 'workspace-header');
  const text = el('div');
  text.append(el('h1', title), el('p', subtitle));
  if (DEMO_PAGES.has(route)
    && (route !== 'platform-activity' || staff?.role !== 'platform_admin')) {
    text.append(el('span', 'Demo data', 'workspace-demo'));
  }
  node.append(text);
  target.append(node);
}

function downloadCsv(filename, headings, rows) {
  const csv = toCsv(rows, headings);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = el('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function openForm(target, title, fields, onSubmit) {
  const form = document.createElement('form');
  form.className = 'workspace-form';
  for (const field of fields) {
    const label = el('label', field.label);
    const input = field.options
      ? document.createElement('select')
      : (field.multiline ? document.createElement('textarea') : document.createElement('input'));
    input.name = field.name;
    input.required = Boolean(field.required);
    if (field.options) {
      for (const option of field.options) {
        const opt = el('option', option);
        opt.value = option;
        input.append(opt);
      }
    }
    label.append(input);
    form.append(label);
  }
  form.append(button('Save', (event) => event.preventDefault(), 'primary'));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit(Object.fromEntries(new FormData(form).entries()));
  });
  const dialog = modal(target, title, form);
  form.querySelector('button').addEventListener('click', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    form.requestSubmit();
    dialog.close();
    dialog.remove();
  });
  return form;
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
  let lifecycle = 'Published';
  let composeType = 'Alert';
  const data = mockData.posts;
  const content = el('div');
  const render = () => {
    content.replaceChildren(tabs(['Published', 'Draft', 'Scheduled', 'Archived'], lifecycle, (value) => {
      lifecycle = value;
      render();
    }));
    const rows = data.filter((post) => post.status === lifecycle);
    if (!rows.length) {
      content.append(emptyState('No posts', `There are no ${lifecycle.toLowerCase()} posts.`));
    } else {
      content.append(table(['Author organisation', 'Time', 'Type', 'Post', 'Views / votes', 'Status'],
        rows.map((post) => [post.author, post.time, statusPill(post.type), post.body, post.metric, post.status])));
    }
  };
  target.append(button('Create post', () => {
    const form = document.createElement('form');
    form.className = 'workspace-form';
    form.append(tabs(['Alert', 'News', 'Poll'], composeType, (value) => { composeType = value; }));
    const label = el('label', 'Post body');
    const textarea = document.createElement('textarea');
    textarea.required = true;
    label.append(textarea);
    form.append(label);
    modal(target, 'Create post', form);
    const submit = button('Save draft', () => {
      if (!textarea.value.trim()) return;
      data.unshift({ id: crypto.randomUUID(), author: 'Demo organisation', time: 'Just now', type: composeType, body: textarea.value.trim(), metric: '0 views', status: 'Draft' });
      render();
      toast(target, 'Draft saved locally.');
      form.closest('dialog')?.close();
    }, 'primary');
    form.append(submit);
  }, 'primary'));
  target.append(card('', content));
  render();
}

function renderSurveys(target) {
  const content = el('div');
  let selected = mockData.surveys[0];
  let detailTab = 'Responses';
  const render = () => {
    content.replaceChildren();
    const rows = mockData.surveys.map((survey) => {
      const actions = el('div', undefined, 'workspace-actions');
      actions.append(button('View', () => { selected = survey; render(); }));
      if (survey.status === 'Active') actions.append(button('Close', () => { survey.status = 'Closed'; render(); }));
      if (survey.status !== 'Archived') actions.append(button('Archive', () => { survey.status = 'Archived'; render(); }));
      return [survey.title, survey.questions, statusPill(survey.status), survey.responses, survey.created, actions];
    });
    content.append(table(['Title', 'Questions', 'Status', 'Responses', 'Created', 'Actions'], rows));
    content.append(el('p', 'Editing unavailable once responses exist.', 'workspace-note'));
    if (!selected) return;
    content.append(tabs(['Responses', 'Analytics'], detailTab, (value) => { detailTab = value; render(); }));
    if (detailTab === 'Responses') content.append(emptyState('Survey responses', `${selected.responses} responses recorded.`));
    else content.append(card('Response totals by question', barChart(selected.results)));
  };
  target.append(button('Create survey', () => openForm(target, 'Create survey', [
    { name: 'title', label: 'Survey title', required: true },
    { name: 'question', label: 'First question', required: true }
  ], ({ title }) => {
    mockData.surveys.unshift({ id: crypto.randomUUID(), title, questions: 1, status: 'Draft', responses: 0, created: new Date().toISOString().slice(0, 10), results: [0] });
    selected = mockData.surveys[0];
    render();
    toast(target, 'Survey saved locally.');
  }), 'primary'));
  target.append(card('', content));
  render();
}

function barChart(values) {
  const chart = el('div', undefined, 'workspace-bars');
  values.forEach((value, index) => {
    const row = el('div', undefined, 'workspace-bar-row');
    row.append(el('span', `Question ${index + 1}`));
    const track = el('div', undefined, 'workspace-bar-track');
    const bar = el('div', undefined, 'workspace-bar');
    bar.style.width = `${Math.min(100, Number(value) || 0)}%`;
    track.append(bar);
    row.append(track, el('strong', value));
    chart.append(row);
  });
  return chart;
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
  link.click();
  URL.revokeObjectURL(url);
}

function printReports(reports) {
  const frame = document.createElement('iframe');
  frame.title = 'Printable report sheet';
  frame.hidden = true;
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
    ['Report sheet', ['CSV', 'PDF']],
    ['Surveys', ['CSV']],
    ['Polls', ['CSV']]
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
            } else {
              const rows = name === 'Surveys'
                ? mockData.surveys.map((item) => [item.title, item.status, item.responses])
                : mockData.posts.filter((item) => item.type === 'Poll')
                  .map((item) => [item.author, item.body, item.metric]);
              downloadCsv(`${name.toLowerCase()}.csv`, ['Title / author', 'Status / body', 'Responses / votes'], rows);
              toast(target, `${name} demo data exported.`);
            }
          } catch (error) {
            toast(target, error.message || 'Export failed.', true);
          }
        })();
      }));
    }
    target.append(card(name, actions));
  }
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
  const switchLabel = el('label', 'Pilot mode enabled ');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = true;
  switchLabel.append(toggle);
  target.append(card('Pilot controls', switchLabel));
  const actions = el('div', undefined, 'workspace-actions');
  actions.append(
    button('Create mock organisation', () => openForm(target, 'Create mock organisation', [
      { name: 'name', label: 'Organisation name', required: true },
      { name: 'branches', label: 'Branches', required: true }
    ], ({ name, branches }) => {
      mockData.pilotOrganisations.push({ name, branches: Number(branches), urgency: 'Medium', emailDelivery: false, status: 'Pilot' });
      toast(target, 'Mock organisation created locally.');
      target.querySelector('.workspace-table-wrap')?.replaceWith(renderPilotTable());
    })),
    button('Edit branches', () => modal(target, 'Edit branches', el('p', 'Branch edits are local demo state only.'))),
    button('Promote to real org', () => modal(target, 'Promote to real org', el('p', 'Promotion is unavailable without a server workflow.')))
  );
  target.append(actions, renderPilotTable());
}

function renderPilotTable() {
  return table(['Organisation', 'Branches', 'Default urgency', 'Email delivery', 'Status'],
    mockData.pilotOrganisations.map((o) => [o.name, o.branches, o.urgency, o.emailDelivery ? 'On' : 'Off', statusPill(o.status)]));
}

async function renderActivity(target, role) {
  let activity;
  if (role === 'platform_admin') {
    const { data, error } = await withTimeout(
      supabase.from('organization_status_audit')
        .select('changed_at,actor_id,organization_id,old_status,new_status')
        .order('changed_at', { ascending: false }),
      'Platform audit log query'
    );
    if (error) throw error;
    activity = (data || []).map((row) => ({
      time: row.changed_at,
      actor: row.actor_id,
      action: `organization.${row.old_status}_to_${row.new_status}`,
      target: row.organization_id
    }));
  } else {
    activity = mockData.activity;
  }
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
  target.append(emptyState('No conversations yet. Threads open when a resident messages an organisation about a report.', 'This inbox is read-only. Replies and deletion are not available.'));
}

function renderManageProfiles(target) {
  target.append(button('Invite platform employee', () => openForm(target, 'Invite platform employee', [
    { name: 'email', label: 'Email', required: true },
    { name: 'role', label: 'Access level', options: ['Platform Employee', 'Support'] }
  ], () => toast(target, 'Invitation flow is mocked; no invite was sent.'))));
  target.append(table(['Name', 'Email', 'Role', 'Status', 'Actions'], mockData.staff.map((person) => [
    person.name, person.email, person.role, statusPill(person.status),
    button('Deactivate', () => toast(target, 'Staff changes are mocked; no account was changed.'))
  ])));
}

function renderSettings(target) {
  const form = document.createElement('form');
  form.className = 'workspace-form';
  for (const [name, value] of Object.entries({
    'Platform name': mockData.settings.platformName,
    'Support contact': mockData.settings.supportContact,
    'Default categories': mockData.settings.categories,
    'Session timeout (minutes)': mockData.settings.sessionTimeout
  })) {
    const label = el('label', name);
    const input = document.createElement('input');
    input.value = String(value);
    label.append(input);
    form.append(label);
  }
  const twoFactorLabel = el('label', 'Require 2FA ');
  const twoFactor = document.createElement('input');
  twoFactor.type = 'checkbox';
  twoFactor.checked = mockData.settings.twoFactor;
  twoFactorLabel.append(twoFactor);
  form.append(twoFactorLabel, el('p', 'Settings shown here are demo values and are not saved.'));
  target.append(card('Platform defaults', form), card('Audit log preview', table(['Time', 'Action'], mockData.activity.slice(0, 2).map((r) => [r.time, r.action]))));
}

function renderTeam(target) {
  target.append(button('Invite staff', () => openForm(target, 'Invite platform staff', [
    { name: 'email', label: 'Email', required: true },
    { name: 'level', label: 'Access level', options: ['Full Admin', 'Support'] }
  ], () => toast(target, 'Invitation flow is mocked; no invite was sent.'))));
  target.append(table(['Name', 'Email', 'Access level', 'Status', 'Actions'], mockData.staff.map((person) => [
    person.name, person.email, person.role, statusPill(person.status),
    button('Revoke access', () => toast(target, 'Access revocation is mocked; no account was changed.', true))
  ])));
}

export async function mountWorkspacePage(route, target, { staff, onSignOut } = {}) {
  target.replaceChildren();
  header(route, target, staff);
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
