import { requestSupabase } from '@civicneuro/supabase-client';

export const UNSURE_REPORT_ORGANISATION = Object.freeze({
  id: '',
  name: 'Unsure / Not specified'
});

export function mapReportOrganisationOptions(rows) {
  if (!Array.isArray(rows)) return [UNSURE_REPORT_ORGANISATION];

  const organisations = rows
    .filter((row) => row && typeof row.id === 'string' && row.id
      && typeof row.name === 'string' && row.name.trim()
      && (row.status === undefined || (row.status === 'approved' && row.is_active === true))
      && (row.is_active === undefined || row.is_active === true))
    .map((row) => ({ id: row.id, name: row.name.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [UNSURE_REPORT_ORGANISATION, ...organisations];
}

export async function loadReportOrganisationOptions(
  request = requestSupabase,
  logError = console.error
) {
  try {
    const rows = await request('/rest/v1/rpc/list_report_organisations', {
      method: 'POST',
      body: {},
      auth: false
    });
    const options = mapReportOrganisationOptions(rows);
    if (options.length === 1) {
      logError('[report] No approved organisations were returned.');
    }
    return options;
  } catch (error) {
    logError('[report] Could not load approved organisations.', error);
    return [UNSURE_REPORT_ORGANISATION];
  }
}
