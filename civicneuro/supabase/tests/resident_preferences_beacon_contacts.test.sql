BEGIN;

CREATE TEMP TABLE cn_test_users (
  label text PRIMARY KEY,
  id uuid NOT NULL
);
CREATE TEMP TABLE cn_test_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL
);
CREATE TEMP TABLE cn_test_contact (
  id uuid NOT NULL
);

GRANT ALL ON cn_test_users, cn_test_results, cn_test_contact TO authenticated, service_role;

INSERT INTO cn_test_users (label, id)
VALUES ('A', gen_random_uuid()), ('B', gen_random_uuid());

INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
SELECT
  id,
  'authenticated',
  'authenticated',
  'resident-preferences-' || replace(id::text, '-', '') || '@example.invalid',
  '',
  '{}'::jsonb,
  jsonb_build_object(
    'privacy_consent_at', now()::text,
    'full_name', 'Preferences Test ' || label,
    'phone', '0823456701',
    'address', 'Test address'
  )
FROM cn_test_users;

INSERT INTO public.resident_profiles (id, full_name, email, phone, address, privacy_consent_at)
SELECT
  users.id,
  'Preferences Test ' || users.label,
  'resident-preferences-' || replace(users.id::text, '-', '') || '@example.invalid',
  '0823456701',
  'Test address',
  now()
FROM cn_test_users AS users
ON CONFLICT (id) DO UPDATE
SET full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    address = EXCLUDED.address,
    privacy_consent_at = EXCLUDED.privacy_consent_at;

CREATE FUNCTION pg_temp.set_test_claims(test_label text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  test_user_id uuid;
BEGIN
  SELECT id INTO test_user_id FROM pg_temp.cn_test_users WHERE label = test_label;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', test_user_id::text, 'role', 'authenticated')::text,
    true
  );
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_test_claims('A');

INSERT INTO pg_temp.cn_test_results
SELECT 'Profile owner can read own row', count(*) = 1
FROM public.resident_profiles
WHERE id = (SELECT id FROM pg_temp.cn_test_users WHERE label = 'A');

INSERT INTO pg_temp.cn_test_results
SELECT 'Profile owner cannot read another row', count(*) = 0
FROM public.resident_profiles
WHERE id = (SELECT id FROM pg_temp.cn_test_users WHERE label = 'B');

UPDATE public.resident_profiles
SET full_name = 'Preferences Test A Updated'
WHERE id = (SELECT id FROM pg_temp.cn_test_users WHERE label = 'A');

INSERT INTO pg_temp.cn_test_results
SELECT 'Allowed profile update persists on reread', count(*) = 1
FROM public.resident_profiles
WHERE id = (SELECT id FROM pg_temp.cn_test_users WHERE label = 'A')
  AND full_name = 'Preferences Test A Updated';

DO $$
DECLARE
  denied boolean := false;
BEGIN
  BEGIN
    UPDATE public.resident_profiles
    SET privacy_consent_at = now()
    WHERE id = (SELECT id FROM pg_temp.cn_test_users WHERE label = 'A');
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  INSERT INTO pg_temp.cn_test_results
  VALUES ('Authenticated cannot update privacy_consent_at', denied);
END;
$$;

WITH inserted AS (
  INSERT INTO public.beacon_contacts (owner_id, name, phone, phone_normalized)
  VALUES (
    (SELECT id FROM pg_temp.cn_test_users WHERE label = 'A'),
    'Beacon Test Contact',
    '+27 (82) 345-6701',
    '27823456701'
  )
  RETURNING id
)
INSERT INTO pg_temp.cn_test_contact (id)
SELECT id FROM inserted;

INSERT INTO pg_temp.cn_test_results
SELECT 'Beacon owner can list own contact', count(*) = 1
FROM public.beacon_contacts
WHERE id = (SELECT id FROM pg_temp.cn_test_contact);

UPDATE public.beacon_contacts
SET name = 'Beacon Test Contact Updated',
    phone = '+27 (82) 345-6702',
    phone_normalized = '27823456702'
WHERE id = (SELECT id FROM pg_temp.cn_test_contact);

INSERT INTO pg_temp.cn_test_results
SELECT 'Beacon owner can update phone and name', count(*) = 1
FROM public.beacon_contacts
WHERE id = (SELECT id FROM pg_temp.cn_test_contact)
  AND name = 'Beacon Test Contact Updated'
  AND phone_normalized = '27823456702';

SELECT pg_temp.set_test_claims('B');

WITH changed AS (
  UPDATE public.resident_profiles
  SET full_name = 'Unauthorized profile update'
  WHERE id = (SELECT id FROM pg_temp.cn_test_users WHERE label = 'A')
  RETURNING id
)
INSERT INTO pg_temp.cn_test_results
SELECT 'Other resident cannot update profile', count(*) = 0
FROM changed;

INSERT INTO pg_temp.cn_test_results
SELECT 'Other resident cannot read Beacon contact', count(*) = 0
FROM public.beacon_contacts
WHERE id = (SELECT id FROM pg_temp.cn_test_contact);

WITH changed AS (
  UPDATE public.beacon_contacts
  SET name = 'Unauthorized update'
  WHERE id = (SELECT id FROM pg_temp.cn_test_contact)
  RETURNING id
)
INSERT INTO pg_temp.cn_test_results
SELECT 'Other resident cannot update Beacon contact', count(*) = 0
FROM changed;

WITH deleted AS (
  DELETE FROM public.beacon_contacts
  WHERE id = (SELECT id FROM pg_temp.cn_test_contact)
  RETURNING id
)
INSERT INTO pg_temp.cn_test_results
SELECT 'Other resident cannot delete Beacon contact', count(*) = 0
FROM deleted;

SELECT pg_temp.set_test_claims('A');

INSERT INTO pg_temp.cn_test_results
SELECT 'Non-owner attempts leave Beacon contact unchanged', count(*) = 1
FROM public.beacon_contacts
WHERE id = (SELECT id FROM pg_temp.cn_test_contact)
  AND name = 'Beacon Test Contact Updated'
  AND phone_normalized = '27823456702';

DELETE FROM public.beacon_contacts
WHERE id = (SELECT id FROM pg_temp.cn_test_contact);

INSERT INTO pg_temp.cn_test_results
SELECT 'Beacon owner can delete own contact', count(*) = 0
FROM public.beacon_contacts
WHERE id = (SELECT id FROM pg_temp.cn_test_contact);

RESET ROLE;

UPDATE auth.users
SET email = 'confirmed-' || replace(id::text, '-', '') || '@example.invalid'
WHERE id = (SELECT id FROM pg_temp.cn_test_users WHERE label = 'A');

INSERT INTO pg_temp.cn_test_results
SELECT 'Auth email change synchronizes to resident profile', count(*) = 1
FROM public.resident_profiles AS profiles
JOIN auth.users AS users ON users.id = profiles.id
WHERE profiles.id = (SELECT id FROM pg_temp.cn_test_users WHERE label = 'A')
  AND profiles.email = users.email;

SELECT test_name, passed
FROM pg_temp.cn_test_results
ORDER BY test_name;

ROLLBACK;
