import { supabase } from '../supabase.client.js';

async function queryWithTimeout(request, label) {
  let timer;
  try {
    return await Promise.race([
      request,
      new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(`${label} timed out. Try again.`)), 15000);
      })
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

export async function listReports(organizationId) {
  const { data, error } = await queryWithTimeout(
    supabase.from('reports')
      .select('*')
      .eq('assigned_organization_id', organizationId)
      .order('created_at', { ascending: false }),
    'Report query'
  );
  if (error) throw error;
  return data || [];
}

export async function getReport(reportId) {
  const { data, error } = await queryWithTimeout(
    supabase.from('reports').select('*').eq('id', reportId).maybeSingle(),
    'Report detail query'
  );
  if (error) throw error;
  return data;
}

export async function listReportEvents(reportId) {
  const { data, error } = await queryWithTimeout(
    supabase.from('report_events')
      .select('id,event_type,note,from_status,to_status,created_at,actor_id')
      .eq('report_id', reportId)
      .order('created_at', { ascending: false }),
    'Report timeline query'
  );
  if (error) throw error;
  return data || [];
}

export async function listAssignableOrganizations() {
  const { data, error } = await queryWithTimeout(
    supabase.from('organizations')
      .select('id,name')
      .eq('status', 'approved')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    'Organisation lookup'
  );
  if (error) throw error;
  return data || [];
}

export async function updateReport(reportId, status, note = '') {
  const { data, error } = await queryWithTimeout(
    supabase.rpc('organization_update_report', {
      p_report_id: reportId,
      p_status: status,
      p_note: note.trim() || null
    }),
    'Report status update'
  );
  if (error) throw error;
  return data;
}

export async function reassignReport(reportId, organizationId, note = '') {
  const { data, error } = await queryWithTimeout(
    supabase.rpc('organization_reassign_report', {
      p_report_id: reportId,
      p_organization_id: organizationId,
      p_note: note.trim() || null
    }),
    'Report reassignment'
  );
  if (error) throw error;
  return data;
}