import { supabase } from '../../features/supabase.client.js';

export async function mountMyProfile(target, { context }) {
  target.replaceChildren();
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name,first_name,last_name,email,phone,title,preferred_language,municipality,province')
      .eq('id', context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!target.isConnected) return;
    const profile = data || {};
    const name = profile.full_name
      || [profile.first_name, profile.last_name].filter(Boolean).join(' ')
      || context.fullName
      || 'Not provided';
    const card = document.createElement('section');
    card.className = 'org-card';
    const heading = document.createElement('h2');
    heading.textContent = 'My profile';
    card.append(heading);
    for (const [label, value] of [
      ['Name', name],
      ['Email', context.email || profile.email || 'Not provided'],
      ['Phone', profile.phone || 'Not provided'],
      ['Title', profile.title || 'Not provided'],
      ['Preferred language', profile.preferred_language || 'Not provided'],
      ['Municipality', profile.municipality || 'Not provided'],
      ['Province', profile.province || 'Not provided'],
      ['Role', context.role === 'org_admin' ? 'Organisation Admin' : 'Organisation Employee'],
      ['Organisation', context.organization.name]
    ]) {
      const row = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = `${label}: `;
      row.append(strong, document.createTextNode(value));
      card.append(row);
    }
    const note = document.createElement('p');
    note.className = 'org-muted';
    note.textContent = 'Profile editing is not available yet.';
    card.append(note);
    target.append(card);
  } catch (error) {
    const message = document.createElement('p');
    message.className = 'org-message';
    message.setAttribute('role', 'alert');
    message.textContent = error.message || 'Could not load your profile.';
    target.append(message);
  }
}