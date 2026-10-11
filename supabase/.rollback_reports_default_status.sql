begin;

alter table public.reports
  alter column status set default 'Pending Dispatch';

do $$
begin
  if (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reports'
      and column_name = 'status'
  ) <> '''Pending Dispatch''::character varying' then
    raise exception 'Unexpected status default after migration change';
  end if;
end
$$;

rollback;
