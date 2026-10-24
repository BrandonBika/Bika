import { supabase } from './supabase.client.js';
import { withTimeout } from './with-timeout.js';

function throwQueryError(error) {
  if (!error) return;
  console.error('Platform report query failed.', error);
  throw new Error('No access: check your staff account');
}

async function optionalLookup(query, label, fallback) {
  try {
    const { data, error } = await withTimeout(query, label);
    if (error) {
      console.error('Optional reporter lookup failed.', {
        lookup: label,
        error: error?.message || 'Unknown error'
      });
      return fallback;
    }
    return data ?? fallback;
  } catch (error) {
    console.error('Optional reporter lookup failed.', {
      lookup: label,
      error: error?.message || 'Unknown error'
    });
    return fallback;
  }
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
  const guestReportIds = reports
    .filter((report) => report.reporter_type === 'guest')
    .map((report) => report.id);
  const residentIds = [...new Set(reports
    .filter((report) => report.reporter_type === 'resident')
    .map((report) => report.reporter_id)
    .filter((id) => id !== null && id !== undefined))];

  const [guestResult, residentResult] = await Promise.all([
    guestReportIds.length
      ? optionalLookup(
        supabase.from('guest_contacts')
          .select('report_id,phone,email,contact_preference,consent_to_updates,consent_revoked_at')
          .in('report_id', guestReportIds),
        'Guest contacts query',
        []
      )
      : Promise.resolve([]),
    residentIds.length
      ? optionalLookup(
        supabase.from('resident_profiles')
          .select('id,full_name,phone,email')
          .in('id', residentIds),
        'Resident profiles query',
        []
      )
      : Promise.resolve([])
  ]);
  return {
    reports,
    organizations,
    guestContacts: new Map(guestResult.map((contact) => [contact.report_id, contact])),
    residentProfiles: new Map(residentResult.map((profile) => [profile.id, profile]))
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

  const [organizations, guestContact, residentProfile, evidenceResult, eventsResult] = await Promise.all([
    listOrganizations(),
    report.reporter_type === 'guest'
      ? optionalLookup(
        supabase.from('guest_contacts')
          .select('report_id,phone,email,contact_preference,consent_to_updates,consent_revoked_at')
          .eq('report_id', reportId)
          .maybeSingle(),
        'Guest contact query',
        null
      )
      : Promise.resolve(null),
    report.reporter_type === 'resident' && report.reporter_id
      ? optionalLookup(
        supabase.from('resident_profiles')
          .select('id,full_name,phone,email')
          .eq('id', report.reporter_id)
          .maybeSingle(),
        'Resident profile query',
        null
      )
      : Promise.resolve(null),
    withTimeout(
      supabase.from('report_evidence').select('*').eq('report_id', reportId).order('created_at'),
      'Report evidence query'
    ),
    withTimeout(
      supabase.from('report_events').select('*').eq('report_id', reportId).order('created_at'),
      'Report events query'
    )
  ]);

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
    guestContact,
    residentProfile,
    evidence,
    events: eventsResult.data ?? []
  };
}
