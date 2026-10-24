begin;

create temp table cn_messaging_test_users (
  label text primary key,
  id uuid not null
);
create temp table cn_messaging_test_results (
  test_name text primary key,
  passed boolean not null
);
create temp table cn_messaging_test_conversations (
  label text primary key,
  id uuid not null
);
grant all on cn_messaging_test_users, cn_messaging_test_results,
  cn_messaging_test_conversations to anon, authenticated, service_role;

insert into cn_messaging_test_users (label, id)
values
  ('A', gen_random_uuid()),
  ('B', gen_random_uuid()),
  ('C', gen_random_uuid()),
  ('D', gen_random_uuid());

reset role;
insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select
  id,
  'authenticated',
  'authenticated',
  'messaging-test-' || replace(id::text, '-', '') || '@example.invalid',
  '',
  '{}'::jsonb,
  '{}'::jsonb
from pg_temp.cn_messaging_test_users;

insert into public.resident_profiles (id, full_name, email, phone, address, privacy_consent_at)
select
  id,
  'Messaging Test ' || label,
  'messaging-test-' || replace(id::text, '-', '') || '@example.invalid',
  '',
  '',
  now()
from pg_temp.cn_messaging_test_users;
insert into public.beacon_connections (requester_id, addressee_id, status, responded_at)
select
  (select id from pg_temp.cn_messaging_test_users where label = 'A'),
  targets.id,
  'accepted',
  now()
from pg_temp.cn_messaging_test_users as targets
where targets.label in ('B', 'C', 'D');
reset role;

create function pg_temp.set_messaging_test_claims(test_label text)
returns void
language plpgsql
as $$
declare
  test_user_id uuid;
begin
  select id into test_user_id
  from pg_temp.cn_messaging_test_users
  where label = test_label;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', test_user_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

set local role authenticated;
select pg_temp.set_messaging_test_claims('A');

insert into pg_temp.cn_messaging_test_conversations (label, id)
values (
  'direct_ab',
  public.create_direct_conversation(
    (select id from pg_temp.cn_messaging_test_users where label = 'B')
  )
);
insert into pg_temp.cn_messaging_test_results
select 'Repeated direct conversation creation returns the same conversation',
  public.create_direct_conversation(
    (select id from pg_temp.cn_messaging_test_users where label = 'B')
  ) = (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab');

    do $$
    declare
      self_rejected boolean := false;
      unknown_rejected boolean := false;
      test_user_id uuid;
    begin
      select id into test_user_id
      from pg_temp.cn_messaging_test_users
      where label = 'A';
      begin
        perform public.create_direct_conversation(test_user_id);
      exception when invalid_parameter_value then
        self_rejected := true;
      end;
      begin
        perform public.create_direct_conversation(gen_random_uuid());
      exception when invalid_parameter_value then
        unknown_rejected := true;
      end;
      insert into pg_temp.cn_messaging_test_results
      values
        ('Self-chat is rejected', self_rejected),
        ('Unknown resident is rejected', unknown_rejected);
    end;
    $$;

    insert into pg_temp.cn_messaging_test_conversations (label, id)
    values (
      'group_abc',
      public.create_group_conversation(
        'Messaging Test Group',
        array[(select id from pg_temp.cn_messaging_test_users where label = 'B')]
      )
    );
    select public.add_group_member(
      (select id from pg_temp.cn_messaging_test_conversations where label = 'group_abc'),
      (select id from pg_temp.cn_messaging_test_users where label = 'C')
    );
    insert into pg_temp.cn_messaging_test_conversations (label, id)
    values (
      'rate_limit_group',
      public.create_group_conversation(
        'Messaging Rate Limit Group',
        array[(select id from pg_temp.cn_messaging_test_users where label = 'D')]
      )
    );
    insert into pg_temp.cn_messaging_test_results
    select 'Group creator is an administrator', count(*) = 1
    from public.conversation_members
    where conversation_id = (select id from pg_temp.cn_messaging_test_conversations where label = 'group_abc')
      and user_id = (select id from pg_temp.cn_messaging_test_users where label = 'A')
      and role = 'admin';

    insert into public.messages (conversation_id, type, body)
values (
  (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab'),
  'text',
  'Member message'
);

insert into pg_temp.cn_messaging_test_results
select 'Conversation member can read messages', count(*) = 1
from public.messages
where conversation_id = (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab');

select pg_temp.set_messaging_test_claims('B');
insert into pg_temp.cn_messaging_test_results
select 'Other conversation member can read messages', count(*) = 1
from public.messages
where conversation_id = (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab');
insert into public.messages (conversation_id, type, body)
values (
  (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab'),
  'text',
  'Second member message'
);
select public.mark_conversation_read(
  (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab')
);
insert into pg_temp.cn_messaging_test_results
select 'Conversation member can insert a message and mark it read',
  (select count(*) = 2
   from public.messages
   where conversation_id = (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab'))
  and (select last_read_at is not null
       from public.conversation_members
       where conversation_id = (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab')
         and user_id = (select id from pg_temp.cn_messaging_test_users where label = 'B'));

select pg_temp.set_messaging_test_claims('C');
insert into pg_temp.cn_messaging_test_results
select 'Added group member can read group metadata', count(*) = 1
from public.conversations
where id = (select id from pg_temp.cn_messaging_test_conversations where label = 'group_abc');
select public.leave_conversation(
  (select id from pg_temp.cn_messaging_test_conversations where label = 'group_abc')
);
insert into pg_temp.cn_messaging_test_results
select 'Removed member cannot read the conversation', count(*) = 0
from public.conversations
where id = (select id from pg_temp.cn_messaging_test_conversations where label = 'group_abc');
insert into pg_temp.cn_messaging_test_results
select 'Removed member cannot read conversation members', count(*) = 0
from public.conversation_members
where conversation_id = (select id from pg_temp.cn_messaging_test_conversations where label = 'group_abc');
insert into pg_temp.cn_messaging_test_results
select 'Removed member cannot read existing group messages', count(*) = 0
from public.messages
where conversation_id = (select id from pg_temp.cn_messaging_test_conversations where label = 'group_abc');

select pg_temp.set_messaging_test_claims('A');
insert into public.messages (conversation_id, type, body)
values (
  (select id from pg_temp.cn_messaging_test_conversations where label = 'group_abc'),
  'text',
  'Message after member left'
);
select pg_temp.set_messaging_test_claims('C');
insert into pg_temp.cn_messaging_test_results
select 'Removed member cannot read new group messages', count(*) = 0
from public.messages
where conversation_id = (select id from pg_temp.cn_messaging_test_conversations where label = 'group_abc');

do $$
declare
  denied boolean := false;
begin
  begin
    insert into public.messages (conversation_id, type, body)
    values (
      (select id from pg_temp.cn_messaging_test_conversations where label = 'group_abc'),
      'text',
      'Message after leaving'
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  insert into pg_temp.cn_messaging_test_results
  values ('Removed member cannot send messages', denied);
end;
$$;

insert into pg_temp.cn_messaging_test_results
select 'Non-member cannot read conversations', count(*) = 0
from public.conversations
where id = (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab');
insert into pg_temp.cn_messaging_test_results
select 'Non-member cannot read conversation members', count(*) = 0
from public.conversation_members
where conversation_id = (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab');
insert into pg_temp.cn_messaging_test_results
select 'Non-member cannot read messages', count(*) = 0
from public.messages
where conversation_id = (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab');

do $$
declare
  denied boolean := false;
begin
  begin
    insert into public.messages (conversation_id, type, body)
    values (
      (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab'),
      'text',
      'Non-member message'
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  insert into pg_temp.cn_messaging_test_results
  values ('Non-member cannot insert a message', denied);
end;
$$;

select pg_temp.set_messaging_test_claims('A');
do $$
declare
  conversation_denied boolean := false;
  member_denied boolean := false;
begin
  begin
    insert into public.conversations (kind, created_by, direct_user_low, direct_user_high)
    values (
      'direct',
      (select id from pg_temp.cn_messaging_test_users where label = 'A'),
      (select id from pg_temp.cn_messaging_test_users where label = 'A'),
      (select id from pg_temp.cn_messaging_test_users where label = 'B')
    );
  exception when insufficient_privilege then
    conversation_denied := true;
  end;
  begin
    insert into public.conversation_members (conversation_id, user_id)
    values (
      (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab'),
      (select id from pg_temp.cn_messaging_test_users where label = 'C')
    );
  exception when insufficient_privilege then
    member_denied := true;
  end;
  insert into pg_temp.cn_messaging_test_results
  values
    ('Client cannot insert conversations directly', conversation_denied),
    ('Client cannot insert conversation members directly', member_denied);
end;
$$;

do $$
declare
  denied boolean := false;
begin
  begin
    insert into public.messages (conversation_id, sender_id, type, body)
    values (
      (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab'),
      (select id from pg_temp.cn_messaging_test_users where label = 'B'),
      'text',
      'Spoofed sender'
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  insert into pg_temp.cn_messaging_test_results
  values ('Member cannot send as another user', denied);
end;
$$;

do $$
declare
  denied boolean := false;
begin
  begin
    insert into public.messages (conversation_id, type, body)
    values (
      (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab'),
      'system',
      'Client system message'
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  insert into pg_temp.cn_messaging_test_results
  values ('Client cannot insert system messages', denied);
end;
$$;

do $$
declare
  update_denied boolean := false;
  delete_denied boolean := false;
begin
  begin
    update public.messages
    set body = 'Edited message'
    where conversation_id = (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab');
  exception when insufficient_privilege then
    update_denied := true;
  end;
  begin
    delete from public.messages
    where conversation_id = (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab');
  exception when insufficient_privilege then
    delete_denied := true;
  end;
  insert into pg_temp.cn_messaging_test_results
  values
    ('Client cannot update messages', update_denied),
    ('Client cannot delete messages', delete_denied);
end;
$$;

do $$
declare
  denied boolean := false;
begin
  begin
    insert into public.messages (conversation_id, type, payload)
    values (
      (select id from pg_temp.cn_messaging_test_conversations where label = 'direct_ab'),
      'path',
      jsonb_build_object(
        'points',
        (select jsonb_agg(jsonb_build_array(0, 0)) from generate_series(1, 1001))
      )
    );
  exception when check_violation then
    denied := true;
  end;
  insert into pg_temp.cn_messaging_test_results
  values ('Path with more than 1000 points is rejected', denied);
end;
$$;

select pg_temp.set_messaging_test_claims('D');
insert into public.messages (conversation_id, type, body)
select
  (select id from pg_temp.cn_messaging_test_conversations where label = 'rate_limit_group'),
  'text',
  'Rate limit message ' || message_number
from generate_series(1, 5) as message_number;

do $$
declare
  sixth_denied boolean := false;
  later_allowed boolean := false;
  conversation_id uuid;
begin
  select id into conversation_id
  from pg_temp.cn_messaging_test_conversations
  where label = 'rate_limit_group';

  begin
    insert into public.messages (conversation_id, type, body)
    values (conversation_id, 'text', 'Rate limited sixth message');
  exception when raise_exception then
    sixth_denied := sqlerrm = 'message rate limit exceeded';
  end;

  perform pg_catalog.pg_sleep(10.1);
  insert into public.messages (conversation_id, type, body)
  values (conversation_id, 'text', 'Message after rate limit window');
  later_allowed := true;

  insert into pg_temp.cn_messaging_test_results
  values
    ('Rate limit blocks the sixth message in ten seconds', sixth_denied),
    ('Rate limit allows messages after ten seconds', later_allowed);
end;
$$;

reset role;

insert into pg_temp.cn_messaging_test_results
select
  'RPC and helper functions have fixed search paths',
  count(*) = 9
from pg_catalog.pg_proc as functions
join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
where namespaces.nspname = 'public'
  and functions.proname in (
    'is_conversation_member',
    'is_valid_message_location',
    'is_valid_message_path',
    'enforce_message_rate_limit',
    'create_direct_conversation',
    'create_group_conversation',
    'add_group_member',
    'leave_conversation',
    'mark_conversation_read'
  )
  and functions.proconfig @> array['search_path=""'];

insert into pg_temp.cn_messaging_test_results
select
  'RPC and helper functions are not executable by anon',
  count(*) = 9
from pg_catalog.pg_proc as functions
join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
where namespaces.nspname = 'public'
  and functions.proname in (
    'is_conversation_member',
    'is_valid_message_location',
    'is_valid_message_path',
    'enforce_message_rate_limit',
    'create_direct_conversation',
    'create_group_conversation',
    'add_group_member',
    'leave_conversation',
    'mark_conversation_read'
  )
  and not has_function_privilege('anon', functions.oid, 'EXECUTE');

insert into pg_temp.cn_messaging_test_results
select
  'Messaging tables do not expose phone or email columns',
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('conversations', 'conversation_members', 'messages')
      and lower(column_name) in ('phone', 'email')
  );

insert into pg_temp.cn_messaging_test_results
select
  'Messaging views do not expose phone or email columns',
  not exists (
    select 1
    from information_schema.views as views
    join information_schema.columns as columns
      using (table_schema, table_name)
    where views.table_schema = 'public'
      and lower(columns.column_name) in ('phone', 'email')
      and views.view_definition ~* '(^|[^a-z_])(conversations|conversation_members|messages)([^a-z_]|$)'
  );

insert into pg_temp.cn_messaging_test_results
select
  'Messaging RPCs do not return contact records',
  count(*) = 5
from pg_catalog.pg_proc as functions
join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
where namespaces.nspname = 'public'
  and functions.proname in (
    'create_direct_conversation',
    'create_group_conversation',
    'add_group_member',
    'leave_conversation',
    'mark_conversation_read'
  )
  and functions.prorettype in ('uuid'::regtype, 'void'::regtype);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  conversations_empty boolean := false;
  members_empty boolean := false;
  messages_empty boolean := false;
  rpc_denied boolean := false;
begin
  begin
    conversations_empty := (select count(*) = 0 from public.conversations);
  exception when insufficient_privilege then
    conversations_empty := true;
  end;
  begin
    members_empty := (select count(*) = 0 from public.conversation_members);
  exception when insufficient_privilege then
    members_empty := true;
  end;
  begin
    messages_empty := (select count(*) = 0 from public.messages);
  exception when insufficient_privilege then
    messages_empty := true;
  end;
  begin
    perform public.create_direct_conversation(gen_random_uuid());
  exception when insufficient_privilege then
    rpc_denied := true;
  end;
  insert into pg_temp.cn_messaging_test_results
  values
    ('Anon cannot read conversations', conversations_empty),
    ('Anon cannot read conversation members', members_empty),
    ('Anon cannot read messages', messages_empty),
    ('Anon cannot execute messaging RPCs', rpc_denied);
end;
$$;

do $$
declare
  conversations_denied boolean := false;
  members_denied boolean := false;
  messages_denied boolean := false;
begin
  begin
    insert into public.conversations (kind, created_by, direct_user_low, direct_user_high)
    values (
      'direct',
      gen_random_uuid(),
      gen_random_uuid(),
      gen_random_uuid()
    );
  exception when insufficient_privilege then
    conversations_denied := true;
  end;
  begin
    insert into public.conversation_members (conversation_id, user_id)
    values (gen_random_uuid(), gen_random_uuid());
  exception when insufficient_privilege then
    members_denied := true;
  end;
  begin
    insert into public.messages (conversation_id, type, body)
    values (gen_random_uuid(), 'text', 'Anon message');
  exception when insufficient_privilege then
    messages_denied := true;
  end;
  insert into pg_temp.cn_messaging_test_results
  values
    ('Anon cannot insert conversations', conversations_denied),
    ('Anon cannot insert conversation members', members_denied),
    ('Anon cannot insert messages', messages_denied);
end;
$$;

reset role;
select test_name, passed
from pg_temp.cn_messaging_test_results
order by test_name;

do $$
declare
  v_failures text;
begin
  select string_agg(test_name, ', ' order by test_name)
    into v_failures
  from pg_temp.cn_messaging_test_results
  where not passed;
  if v_failures is not null then
    raise exception 'Messaging security checks failed: %', v_failures;
  end if;
end;
$$;

rollback;
