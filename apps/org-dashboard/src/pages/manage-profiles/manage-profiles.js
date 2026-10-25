import { supabase } from '../../features/supabase.client.js';

export async function mountManageProfiles(target, { context }) {
  target.replaceChildren();
  try {
    const { data, error } = await supabase
      .from('organization_members')
      .select('user_id,role,is_active,created_at')
      .eq('organization_id', context.organization.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (!target.isConnected) return;
    const card = document.createElement('section');
    card.className = 'org-card';
    const heading = document.createElement('h2');
    heading.textContent = 'Organisation members';
    card.append(heading);
    if (!data?.length) {
      const empty = document.createElement('p');
      empty.className = 'org-empty';
      empty.textContent = 'No organisation members are available.';
      card.append(empty);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'org-table-wrap';
      const table = document.createElement('table');
      table.className = 'org-table';
      const head = table.createTHead().insertRow();
      for (const title of ['User ID', 'Role', 'Status', 'Joined']) {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = title;
        head.append(th);
      }
      const body = table.createTBody();
      for (const member of data) {
        const row = body.insertRow();
        for (const value of [
          member.user_id,
          member.role === 'org_admin' ? 'Organisation Admin' : 'Organisation Employee',
          member.is_active ? 'Active' : 'Inactive',
          formatDate(member.created_at)
        ]) {
          const cell = row.insertCell();
          cell.textContent = value;
        }
      }
      wrap.append(table);
      card.append(wrap);
    }
    const note = document.createElement('p');
    note.className = 'org-muted';
    note.textContent = 'Member invitations and profile editing are not available yet.';
    card.append(note);
    target.append(card);
  } catch (error) {
    renderError(target, error);
  }
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleDateString();
}

function renderError(target, error) {
  const message = document.createElement('p');
  message.className = 'org-message';
  message.setAttribute('role', 'alert');
  message.textContent = error.code === '42501'
    ? 'No access: only organisation administrators can view the member list.'
    : error.message || 'Could not load organisation members.';
  target.append(message);
}