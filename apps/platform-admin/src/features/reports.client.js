import { supabase } from './supabase.client.js';
import { withTimeout } from './with-timeout.js';

function throwQueryError(error) {
  if (!error) return;
  console.error('Platform report query failed.', error);
  throw new Error('No access: check your staff account');
}

export async function listReports() {
  const { data, error } = await withTimeout(
    supabase.from('reports').select('*').order('created_at', { ascending: false }),
    'Reports query'
  );
  throwQueryError(error);
  if (!data?.length) throw new Error('No access: check your staff account');
  return data;
}

export async function getReport(reportId) {
  const { data, error } = await withTimeout(
    supabase.from('reports').select('*').eq('id', reportId).maybeSingle(),
    'Report query'
  );
  throwQueryError(error);
  return data;
}

export async function listOrganizations() {
  const { data, error } = await withTimeout(
    supabase.from('organizations').select('*').order('name', { ascending: true }),
    'Organisations query'
  );
  throwQueryError(error);
  return data ?? [];
}

export async function getReportSheetData() {
  const reports = await listReports();
  const organizations = await listOrganizations();
  const reportIds = reports.map((report) => report.id);
  const reporterIds = [...new Set(reports
    .map((report) => report.reporter_id)
    .filter((id) => id !== null && id !== undefined))];

  const [guestResult, residentResult] = await Promise.all([
    withTimeout(
      supabase.from('guest_contacts').select('*').in('report_id', reportIds),
      'Guest contacts query'
    ),
    reporterIds.length
      ? withTimeout(
        supabase.from('resident_profiles').select('*').in('id', reporterIds),
        'Resident profiles query'
      )
      : Promise.resolve({ data: [], error: null })
  ]);
  throwQueryError(guestResult.error);
  throwQueryError(residentResult.error);
  return {
    reports,
    organizations,
    guestContacts: new Map((guestResult.data ?? []).map((contact) => [contact.report_id, contact])),
    residentProfiles: new Map((residentResult.data ?? []).map((profile) => [profile.id, profile]))
  };
}

export async function reassignReport(reportId, organizationId, note = '') {
  const { data, error } = await withTimeout(
    supabase.rpc('staff_reassign_report', {
      p_report_id: reportId,
      p_organization_id: organizationId,
      p_note: note.trim() || null
    }),
    'Report reassignment'
  );
  if (error) {
    console.error('Report reassignment RPC failed.', error);
    throw error;
  }
  return data;
}

export async function getReportDetailData(reportId) {
  const report = await getReport(reportId);
  if (!report) throw new Error('No access: check your staff account');

  const [organizations, guestResult, residentResult, evidenceResult, eventsResult] = await Promise.all([
    listOrganizations(),
    withTimeout(
      supabase.from('guest_contacts').select('*').eq('report_id', reportId).maybeSingle(),
      'Guest contact query'
    ),
    report.reporter_id
      ? withTimeout(
        supabase.from('resident_profiles').select('*').eq('id', report.reporter_id).maybeSingle(),
        'Resident profile query'
      )
      : Promise.resolve({ data: null, error: null }),
    withTimeout(
      supabase.from('report_evidence').select('*').eq('report_id', reportId).order('created_at'),
      'Report evidence query'
    ),
    withTimeout(
      supabase.from('report_events').select('*').eq('report_id', reportId).order('created_at'),
      'Report events query'
    )
  ]);

  throwQueryError(guestResult.error);
  throwQueryError(residentResult.error);
  throwQueryError(evidenceResult.error);
  throwQueryError(eventsResult.error);

  const evidence = await Promise.all((evidenceResult.data ?? []).map(async (item) => {
    const { data, error } = await withTimeout(
      supabase.storage.from('report-evidence').createSignedUrl(item.path, 60 * 15),
      'Evidence signing request'
    );
    throwQueryError(error);
    return { ...item, signedUrl: data?.signedUrl ?? null };
  }));

  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
  return {
    report,
    organizations,
    assignedOrganization: organizationById.get(report.assigned_organization_id) ?? null,
    recommendedOrganization: organizationById.get(report.recommended_organization_id) ?? null,
    guestContact: guestResult.data,
    residentProfile: residentResult.data,
    evidence,
    events: eventsResult.data ?? []
  };
}
