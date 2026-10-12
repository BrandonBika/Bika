-- Requires a temporary cn_phase_a_test_results sequence created before running.
-- All fixture rows are inserted and rolled back in this transaction.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('f3030000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'phase-a-a@example.invalid', '', '{}'::jsonb,
   jsonb_build_object('privacy_consent_at', now()::text, 'full_name', 'Phase A Test A', 'phone', '', 'address', '')),
  ('f3030000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'phase-a-b@example.invalid', '', '{}'::jsonb,
   jsonb_build_object('privacy_consent_at', now()::text, 'full_name', 'Phase A Test B', 'phone', '', 'address', ''));

set local role service_role;

insert into public.reports (id, source, reporter_id, reporter_type, description, status)
values
  ('f3030000-0000-4000-8000-000000000111', 'report_form', 'f3030000-0000-4000-8000-000000000011', 'resident', 'Phase A resident report', 'Pending Dispatch'),
  ('f3030000-0000-4000-8000-000000000112', 'guest_report', 'f3030000-0000-4000-8000-000000000012', 'guest', 'Phase A guest report', 'Pending Dispatch');

insert into public.report_evidence (report_id, kind, bucket, path, mime_type, size_bytes)
values
  ('f3030000-0000-4000-8000-000000000111', 'image', 'report-evidence', 'f3030000-0000-4000-8000-000000000011/f3030000-0000-4000-8000-000000000111/phase-a.jpg', 'image/jpeg', 123),
  ('f3030000-0000-4000-8000-000000000112', 'image', 'report-evidence', 'f3030000-0000-4000-8000-000000000012/f3030000-0000-4000-8000-000000000112/phase-a.jpg', 'image/jpeg', 123);

insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values
  ('report-evidence', 'f3030000-0000-4000-8000-000000000011/f3030000-0000-4000-8000-000000000111/phase-a.jpg', 'f3030000-0000-4000-8000-000000000011', 'f3030000-0000-4000-8000-000000000011', '{"mimetype":"image/jpeg","size":123}'::jsonb),
  ('report-evidence', 'f3030000-0000-4000-8000-000000000012/f3030000-0000-4000-8000-000000000112/phase-a.jpg', 'f3030000-0000-4000-8000-000000000012', 'f3030000-0000-4000-8000-000000000012', '{"mimetype":"image/jpeg","size":123}'::jsonb);

insert into public.guest_contacts
  (report_id, reporter_id, email, contact_preference, consent_to_updates, consented_at, consent_policy_version)
values
  ('f3030000-0000-4000-8000-000000000112', 'f3030000-0000-4000-8000-000000000012', 'phase-a-b@example.invalid', 'email', true, now(), 'phase-a-test');

reset role;
set local request.jwt.claims = '{"sub":"f3030000-0000-4000-8000-000000000011","role":"authenticated"}';
set local role authenticated;

select setval('public.cn_phase_a_test_results', last_value | case when (select count(*) = 1 from public.reports where id='f3030000-0000-4000-8000-000000000111') then 1 else 0 end, true) from public.cn_phase_a_test_results;
select setval('public.cn_phase_a_test_results', last_value | case when (select count(*) = 0 from public.reports where id='f3030000-0000-4000-8000-000000000112') then 2 else 0 end, true) from public.cn_phase_a_test_results;
select setval('public.cn_phase_a_test_results', last_value | case when (select count(*) = 0 from public.report_evidence where report_id='f3030000-0000-4000-8000-000000000112') then 4 else 0 end, true) from public.cn_phase_a_test_results;
select setval('public.cn_phase_a_test_results', last_value | case when (select count(*) = 0 from public.guest_contacts where report_id='f3030000-0000-4000-8000-000000000112') then 8 else 0 end, true) from public.cn_phase_a_test_results;

do $$ declare n integer; begin begin update public.reports set status='Needs Review' where id='f3030000-0000-4000-8000-000000000111'; get diagnostics n=row_count; if n=0 then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|16,true); end if; exception when insufficient_privilege then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|16,true); end; end $$;
do $$ declare n integer; begin begin update public.reports set report_level='CRITICAL' where id='f3030000-0000-4000-8000-000000000111'; get diagnostics n=row_count; if n=0 then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|32,true); end if; exception when insufficient_privilege then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|32,true); end; end $$;
do $$ declare n integer; begin begin update public.reports set assigned_organization_id=null where id='f3030000-0000-4000-8000-000000000111'; get diagnostics n=row_count; if n=0 then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|64,true); end if; exception when insufficient_privilege then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|64,true); end; end $$;

reset role;
set local request.jwt.claims = '{"sub":"f3030000-0000-4000-8000-000000000012","role":"authenticated"}';
set local role authenticated;

select setval('public.cn_phase_a_test_results', last_value | case when (select count(*) = 1 from public.reports where id='f3030000-0000-4000-8000-000000000112') then 128 else 0 end, true) from public.cn_phase_a_test_results;
do $$ declare n integer; begin begin update public.reports set status='Needs Review' where id='f3030000-0000-4000-8000-000000000112'; get diagnostics n=row_count; if n=0 then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|256,true); end if; exception when insufficient_privilege then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|256,true); end; end $$;
do $$ declare n integer; begin begin update public.reports set report_level='CRITICAL' where id='f3030000-0000-4000-8000-000000000112'; get diagnostics n=row_count; if n=0 then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|512,true); end if; exception when insufficient_privilege then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|512,true); end; end $$;
do $$ declare n integer; begin begin update public.reports set assigned_organization_id=null where id='f3030000-0000-4000-8000-000000000112'; get diagnostics n=row_count; if n=0 then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|1024,true); end if; exception when insufficient_privilege then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|1024,true); end; end $$;
select setval('public.cn_phase_a_test_results', last_value | case when (select count(*) = 0 from storage.objects where bucket_id='report-evidence' and name='f3030000-0000-4000-8000-000000000011/f3030000-0000-4000-8000-000000000111/phase-a.jpg') then 8192 else 0 end, true) from public.cn_phase_a_test_results;

select setval('public.cn_phase_a_test_results', last_value | case when (select count(*) = 1 from public.resident_profiles where id='f3030000-0000-4000-8000-000000000012') then 16384 else 0 end, true) from public.cn_phase_a_test_results;
do $$ begin begin update public.resident_profiles set privacy_consent_at=now() where id='f3030000-0000-4000-8000-000000000012'; exception when insufficient_privilege then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|32768,true); end; end $$;

do $$ begin begin insert into public.reports (id,source,reporter_id,reporter_type,status) values ('f3030000-0000-4000-8000-000000000113','report_form','f3030000-0000-4000-8000-000000000012','resident','Pending Dispatch'); exception when insufficient_privilege then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|524288,true); end; end $$;

reset role;
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
do $$ declare n integer; begin begin select count(*) into n from public.reports; if n=0 then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|1048576,true); end if; exception when insufficient_privilege then perform setval('public.cn_phase_a_test_results',(select last_value from public.cn_phase_a_test_results)|1048576,true); end; end $$;

reset role;
rollback;

select test, case when (last_value & flag)=flag then 'PASS' else 'FAIL' end as result
from public.cn_phase_a_test_results
cross join (values
  ('A reads own report',1::bigint),
  ('A cannot read B report',2::bigint),
  ('A cannot read B evidence',4::bigint),
  ('A cannot read B guest contact',8::bigint),
  ('A cannot update own status',16::bigint),
  ('A cannot update own report_level',32::bigint),
  ('A cannot update own assigned organisation',64::bigint),
  ('B reads own report',128::bigint),
  ('B cannot update own status',256::bigint),
  ('B cannot update own report_level',512::bigint),
  ('B cannot update own assigned organisation',1024::bigint),
  ('anon reads no reports',1048576::bigint),
  ('resident cannot insert directly',524288::bigint),
  ('B cannot read A storage object',8192::bigint),
  ('resident can read own resident_profiles row',16384::bigint),
  ('resident cannot update privacy_consent_at',32768::bigint)
) as checks(test,flag)
order by flag;
