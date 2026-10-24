-- Create or update the private bucket used for uploaded administrative boundaries.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admin-boundaries',
  'admin-boundaries',
  false,
  5242880,
  array['application/geo+json', 'application/json']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Replace the read policy so active platform staff can view boundary objects.
drop policy if exists platform_staff_select_admin_boundary_objects on storage.objects;
create policy platform_staff_select_admin_boundary_objects
  on storage.objects for select to authenticated
  using (
    bucket_id = 'admin-boundaries'
    and public.is_platform_staff()
  );

-- Replace the upload policy so active platform staff can upload GeoJSON files.
drop policy if exists platform_admin_insert_admin_boundary_objects on storage.objects;
drop policy if exists platform_staff_insert_admin_boundary_objects on storage.objects;
create policy platform_staff_insert_admin_boundary_objects
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'admin-boundaries'
    and public.is_platform_staff()
    and right(lower(name), length('.geojson')) = '.geojson'
  );

-- Replace the delete policy so active platform staff can remove boundary objects.
drop policy if exists platform_admin_delete_admin_boundary_objects on storage.objects;
drop policy if exists platform_staff_delete_admin_boundary_objects on storage.objects;
create policy platform_staff_delete_admin_boundary_objects
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'admin-boundaries'
    and public.is_platform_staff()
  );

-- Rollback manually only when the bucket contains no objects.
-- drop policy if exists platform_staff_select_admin_boundary_objects on storage.objects;
-- drop policy if exists platform_admin_insert_admin_boundary_objects on storage.objects;
-- drop policy if exists platform_staff_insert_admin_boundary_objects on storage.objects;
-- drop policy if exists platform_admin_delete_admin_boundary_objects on storage.objects;
-- drop policy if exists platform_staff_delete_admin_boundary_objects on storage.objects;
-- delete from storage.buckets
-- where id = 'admin-boundaries'
--   and not exists (
--     select 1
--     from storage.objects
--     where bucket_id = 'admin-boundaries'
--   );
