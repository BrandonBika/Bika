import { supabase } from '../../features/supabase.client.js';

export async function mountSystemSettings(target, { context }) {
  target.replaceChildren();
  try {
    const { data: organization, error } = await supabase
      .from('organizations')
      .select('name,type,jurisdiction_level,province,municipality,status,is_active,created_at')
      .eq('id', context.organization.id)
      .maybeSingle();
    if (error) throw error;
    if (!target.isConnected) return;
    if (!organization) {
      showMessage(target, 'Organisation profile is unavailable.', true);
      return;
    }

    const profile = document.createElement('section');
    profile.className = 'org-card';
    const heading = document.createElement('h2');
    heading.textContent = 'Organisation profile';
    profile.append(heading);
    for (const [label, value] of [
      ['Name', organization.name],
      ['Type', organization.type],
      ['Jurisdiction', organization.jurisdiction_level],
      ['Province', organization.province],
      ['Municipality', organization.municipality],
      ['Application status', organization.status],
      ['Active', organization.is_active ? 'Yes' : 'No'],
      ['Registered', formatDate(organization.created_at)]
    ]) {
      const row = document.createElement('p');
      const key = document.createElement('strong');
      key.textContent = `${label}: `;
      row.append(key, document.createTextNode(value === null || value === undefined || value === '' ? 'Not provided' : String(value)));
      profile.append(row);
    }
    const unavailable = document.createElement('section');
    unavailable.className = 'org-card';
    const unavailableTitle = document.createElement('h2');
    unavailableTitle.textContent = 'Services, departments, and boundary';
    const note = document.createElement('p');
    note.className = 'org-muted';
    note.textContent = 'These settings are not available yet; no organisation services, departments, or editable boundary data source is configured.';
    unavailable.append(unavailableTitle, note);
    target.append(profile, unavailable);
  } catch (error) {
    showMessage(target, error.message || 'Could not load organisation settings.', true);
  }
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleDateString();
}

function showMessage(target, text, isError) {
  const message = document.createElement('p');
  message.className = 'org-message';
  message.setAttribute('role', isError ? 'alert' : 'status');
  message.textContent = text;
  target.append(message);
}
