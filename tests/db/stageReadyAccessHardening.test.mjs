import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/20261113120000_stage_ready_access_hardening.sql', import.meta.url)
);
const rollbackPath = fileURLToPath(
  new URL('../../supabase/rollback/20261113120000_stage_ready_access_hardening_rollback.sql', import.meta.url)
);

const LEGACY_ID = '00000000-0000-4000-8000-000000000000';
const STUDENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STUDENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADMIN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NEW_USER_ID = '30000000-0000-4000-8000-000000000001';
const ADMIN_PROVISION_ID = '30000000-0000-4000-8000-000000000002';

const R1 = '10000000-0000-4000-8000-000000000001';
const R2 = '10000000-0000-4000-8000-000000000002';
const R3 = '10000000-0000-4000-8000-000000000003';
const R4 = '10000000-0000-4000-8000-000000000004';
const R5 = '10000000-0000-4000-8000-000000000005';
const R6 = '10000000-0000-4000-8000-000000000006';

const M1 = '20000000-0000-4000-8000-000000000001';
const M2 = '20000000-0000-4000-8000-000000000002';
const M3 = '20000000-0000-4000-8000-000000000003';

const A_NORMAL_ACTIVE = `${STUDENT_A}/normal-active.jpg`;
const A_NORMAL_RESOLVED = `${STUDENT_A}/normal-resolved.jpg`;
const A_ORPHAN = `${STUDENT_A}/orphan.jpg`;
const A_OTHER_FOLDER = `${STUDENT_A}/other/sensitive-looking.jpg`;
const A_SENSITIVE_ACTIVE = `${STUDENT_A}/sensitive/active.jpg`;
const B_NORMAL_ACTIVE = `${STUDENT_B}/normal-active.jpg`;
const B_ORPHAN = `${STUDENT_B}/orphan.jpg`;
const B_SENSITIVE_ACTIVE = `${STUDENT_B}/sensitive/active.jpg`;
const B_SENSITIVE_RESOLVED = `${STUDENT_B}/sensitive/resolved.jpg`;
const ADMIN_NORMAL_ACTIVE = `${ADMIN_ID}/normal-active.jpg`;

const fixtureSql = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
CREATE SCHEMA storage;

GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT USAGE ON SCHEMA storage TO authenticated, anon;
GRANT USAGE ON SCHEMA public TO authenticated;

CREATE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb
);

INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
VALUES ('${LEGACY_ID}', 'legacy@old.example', '{}'::jsonb, '{}'::jsonb);

CREATE FUNCTION storage.foldername(object_name text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
BEGIN
  parts := string_to_array(object_name, '/');
  RETURN parts[1:greatest(array_length(parts, 1) - 1, 0)];
END;
$$;

GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated;

CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL,
  owner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  location text NOT NULL,
  date date NOT NULL,
  time text,
  image_url text,
  status text NOT NULL DEFAULT 'lost',
  has_private_verification boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lost_report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  found_report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  score integer NOT NULL,
  reasons text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are readable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Reports are readable by authenticated users"
  ON public.reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update their own reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view matches involving their reports"
  ON public.matches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE reports.id IN (matches.lost_report_id, matches.found_report_id)
        AND reports.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated students can view report images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'report-images');

CREATE POLICY "Students can upload images to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'report-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Students can update own images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'report-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'report-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Students can delete own images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'report-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.matches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;
`;

const seedSql = `
INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data) VALUES
  ('${STUDENT_A}', 'student.a@sguk.ac.in', '{"name":"Student A"}'::jsonb, '{}'::jsonb),
  ('${STUDENT_B}', 'student.b@sguk.ac.in', '{"name":"Student B"}'::jsonb, '{}'::jsonb),
  ('${ADMIN_ID}', 'admin@campus.example', '{"name":"Campus Admin"}'::jsonb, '{"role":"admin"}'::jsonb);

INSERT INTO public.profiles (id, name) VALUES
  ('${STUDENT_A}', 'Student A'),
  ('${STUDENT_B}', 'Student B'),
  ('${ADMIN_ID}', 'Campus Admin');

INSERT INTO public.reports
  (id, user_id, type, title, category, description, location, date, image_url, status, created_at)
VALUES
  ('${R1}', '${STUDENT_A}', 'lost', 'Blue Backpack', 'Bags', 'Blue backpack with a laptop sleeve.', 'Library', '2026-11-01', '${A_NORMAL_ACTIVE}', 'lost', '2026-11-01T10:00:00Z'),
  ('${R2}', '${STUDENT_B}', 'found', 'Blue Backpack Found', 'Bags', 'Found near the library entrance.', 'Library', '2026-11-01', '${B_NORMAL_ACTIVE}', 'found', '2026-11-01T11:00:00Z'),
  ('${R3}', '${STUDENT_A}', 'lost', 'Student ID Card', 'ID Cards', 'College identity card.', 'Cafeteria', '2026-10-28', '${A_NORMAL_RESOLVED}', 'resolved', '2026-10-28T09:00:00Z'),
  ('${R4}', '${STUDENT_B}', 'found', 'Student ID Card Found', 'ID Cards', 'Identity card found after class.', 'Cafeteria', '2026-10-28', '${B_SENSITIVE_RESOLVED}', 'resolved', '2026-10-28T12:00:00Z'),
  ('${R5}', '${STUDENT_B}', 'found', 'Black Wallet', 'Accessories', 'Wallet found near the bus stop.', 'Bus Stop', '2026-11-02', '${B_SENSITIVE_ACTIVE}', 'found', '2026-11-02T08:00:00Z'),
  ('${R6}', '${ADMIN_ID}', 'lost', 'Silver Laptop', 'Electronics', 'Administrator-owned test record.', 'Admin Office', '2026-11-03', '${ADMIN_NORMAL_ACTIVE}', 'lost', '2026-11-03T09:00:00Z');

INSERT INTO public.matches (id, lost_report_id, found_report_id, score, reasons, status)
VALUES
  ('${M1}', '${R1}', '${R2}', 90, ARRAY['Same category', 'Same location'], 'pending'),
  ('${M2}', '${R1}', '${R5}', 62, ARRAY['Same location'], 'verified'),
  ('${M3}', '${R6}', '${R2}', 48, ARRAY['Nearby location'], 'pending');

INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
  ('report-images', '${A_NORMAL_ACTIVE}', '${STUDENT_A}'),
  ('report-images', '${A_NORMAL_RESOLVED}', '${STUDENT_A}'),
  ('report-images', '${A_ORPHAN}', '${STUDENT_A}'),
  ('report-images', '${A_OTHER_FOLDER}', '${STUDENT_A}'),
  ('report-images', '${A_SENSITIVE_ACTIVE}', '${STUDENT_A}'),
  ('report-images', '${B_NORMAL_ACTIVE}', '${STUDENT_B}'),
  ('report-images', '${B_ORPHAN}', '${STUDENT_B}'),
  ('report-images', '${B_SENSITIVE_ACTIVE}', '${STUDENT_B}'),
  ('report-images', '${B_SENSITIVE_RESOLVED}', '${STUDENT_B}'),
  ('report-images', '${ADMIN_NORMAL_ACTIVE}', '${ADMIN_ID}');
`;

const database = new PGlite();

const withRole = async (userId, callback, setupSql) => {
  await database.exec('BEGIN');
  try {
    if (setupSql) await database.exec(setupSql);

    if (userId) {
      const claims = {
        sub: userId,
        role: 'authenticated',
        app_metadata: { role: userId === ADMIN_ID ? 'admin' : 'student' }
      };
      await database.query(
        "SELECT set_config('request.jwt.claims', $1::text, true)",
        [JSON.stringify(claims)]
      );
      await database.exec('SET LOCAL ROLE authenticated');
    } else {
      await database.exec('SET LOCAL ROLE anon');
    }

    return await callback();
  } finally {
    await database.exec('ROLLBACK');
  }
};

const visibleReportIds = async userId => withRole(userId, async () => {
  const result = await database.query('SELECT id FROM public.reports ORDER BY id');
  return result.rows.map(row => row.id);
});

const visibleObjectNames = async userId => withRole(userId, async () => {
  const result = await database.query(
    "SELECT name FROM storage.objects WHERE bucket_id = 'report-images' ORDER BY name"
  );
  return result.rows.map(row => row.name);
});

const visibleMatchIds = async userId => withRole(userId, async () => {
  const result = await database.query('SELECT id FROM public.matches ORDER BY id');
  return result.rows.map(row => row.id);
});

test.before(async () => {
  const migrationSql = await readFile(migrationPath, 'utf8');
  await database.exec(fixtureSql);
  await database.exec(migrationSql);
  await database.exec(migrationSql);
  await database.exec(seedSql);
});

test.after(async () => {
  await database.close();
});

test('migration is self-contained and idempotent', async () => {
  const bucket = await database.query(
    "SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'report-images'"
  );
  assert.equal(bucket.rows.length, 1);
  assert.equal(bucket.rows[0].public, false);
  assert.equal(Number(bucket.rows[0].file_size_limit), 5242880);

  const reportPolicies = await database.query(
    "SELECT policyname, permissive FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reports'"
  );
  const reportPolicyNames = reportPolicies.rows.map(row => row.policyname);
  assert.ok(reportPolicyNames.includes('Active reports are readable by authenticated users'));
  assert.ok(reportPolicyNames.includes('Resolved reports require administrator access'));
  assert.ok(!reportPolicyNames.includes('Reports are readable by authenticated users'));

  const restrictive = reportPolicies.rows.find(
    row => row.policyname === 'Resolved reports require administrator access'
  );
  assert.equal(restrictive.permissive, 'RESTRICTIVE');

  const storagePolicies = await database.query(
    "SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'"
  );
  const storagePolicyNames = storagePolicies.rows.map(row => row.policyname);
  assert.ok(storagePolicyNames.includes('Report image visibility is restricted'));
  assert.ok(storagePolicyNames.includes('Report image inserts require owner folder'));
  assert.ok(storagePolicyNames.includes('Report image updates require owner folder'));
  assert.ok(storagePolicyNames.includes('Report image deletes require owner folder'));
  assert.ok(!storagePolicyNames.includes('Authenticated students can view report images'));

  const functions = await database.query(
    "SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('is_current_user_admin', 'can_access_report_image', 'enforce_college_email_domain')"
  );
  assert.equal(functions.rows.length, 3);

  const trigger = await database.query(
    "SELECT tgname FROM pg_trigger WHERE tgname = 'enforce_college_email_domain' AND NOT tgisinternal"
  );
  assert.equal(trigger.rows.length, 1);
});

test('resolved reports are invisible to students and visible to admins', async () => {
  assert.deepEqual(await visibleReportIds(STUDENT_A), [R1, R2, R5, R6]);
  assert.deepEqual(await visibleReportIds(STUDENT_B), [R1, R2, R5, R6]);
  assert.deepEqual(await visibleReportIds(ADMIN_ID), [R1, R2, R3, R4, R5, R6]);

  await withRole(
    STUDENT_A,
    async () => {
      const result = await database.query('SELECT id FROM public.reports ORDER BY id');
      assert.deepEqual(result.rows.map(row => row.id), [R1, R2, R5, R6]);
    },
    'CREATE POLICY "rogue reports" ON public.reports FOR SELECT TO authenticated USING (true);'
  );
});

test('sensitive and archived images follow owner/admin rules', async () => {
  assert.deepEqual(await visibleObjectNames(STUDENT_A), [
    A_NORMAL_ACTIVE,
    A_NORMAL_RESOLVED,
    A_ORPHAN,
    A_OTHER_FOLDER,
    A_SENSITIVE_ACTIVE,
    B_NORMAL_ACTIVE,
    ADMIN_NORMAL_ACTIVE
  ]);

  assert.deepEqual(await visibleObjectNames(STUDENT_B), [
    A_NORMAL_ACTIVE,
    B_NORMAL_ACTIVE,
    B_ORPHAN,
    B_SENSITIVE_ACTIVE,
    B_SENSITIVE_RESOLVED,
    ADMIN_NORMAL_ACTIVE
  ]);

  assert.deepEqual(await visibleObjectNames(ADMIN_ID), [
    A_NORMAL_ACTIVE,
    A_NORMAL_RESOLVED,
    A_ORPHAN,
    A_OTHER_FOLDER,
    A_SENSITIVE_ACTIVE,
    B_NORMAL_ACTIVE,
    B_ORPHAN,
    B_SENSITIVE_ACTIVE,
    B_SENSITIVE_RESOLVED,
    ADMIN_NORMAL_ACTIVE
  ]);

  await withRole(
    STUDENT_A,
    async () => {
      const result = await database.query(
        "SELECT name FROM storage.objects WHERE bucket_id = 'report-images' ORDER BY name"
      );
      assert.deepEqual(result.rows.map(row => row.name), [
        A_NORMAL_ACTIVE,
        A_NORMAL_RESOLVED,
        A_ORPHAN,
        A_OTHER_FOLDER,
        A_SENSITIVE_ACTIVE,
        B_NORMAL_ACTIVE,
        ADMIN_NORMAL_ACTIVE
      ]);
    },
    'CREATE POLICY "rogue storage read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = \'report-images\');'
  );

  const anonymousCount = await withRole(null, async () => {
    const result = await database.query("SELECT count(*)::int AS count FROM storage.objects");
    return result.rows[0].count;
  });
  assert.equal(anonymousCount, 0);
});

test('storage writes stay inside the caller folder and reject traversal', async () => {
  await withRole(STUDENT_A, async () => {
    await database.query(
      `INSERT INTO storage.objects (bucket_id, name, owner_id)
       VALUES ('report-images', $1, $2)`,
      [`${STUDENT_A}/new-upload.jpg`, STUDENT_A]
    );

    const updated = await database.query(
      `UPDATE storage.objects
       SET name = $1
       WHERE name = $2
       RETURNING name`,
      [`${STUDENT_A}/renamed.jpg`, A_ORPHAN]
    );
    assert.deepEqual(updated.rows.map(row => row.name), [`${STUDENT_A}/renamed.jpg`]);

    const crossFolderDelete = await database.query(
      'DELETE FROM storage.objects WHERE name = $1 RETURNING id',
      [B_NORMAL_ACTIVE]
    );
    assert.equal(crossFolderDelete.rows.length, 0);
  });

  await assert.rejects(
    withRole(STUDENT_A, async () => {
      await database.query(
        `INSERT INTO storage.objects (bucket_id, name, owner_id)
         VALUES ('report-images', $1, $2)`,
        [`${STUDENT_B}/intrusion.jpg`, STUDENT_A]
      );
    }),
    /row-level security/i
  );

  await assert.rejects(
    withRole(STUDENT_A, async () => {
      await database.query(
        `INSERT INTO storage.objects (bucket_id, name, owner_id)
         VALUES ('report-images', $1, $2)`,
        [`${STUDENT_A}/../${STUDENT_B}/traversal.jpg`, STUDENT_A]
      );
    }),
    /row-level security/i
  );
});

test('a report cannot expose another owner\'s unattached image', async () => {
  const names = await withRole(
    STUDENT_A,
    async () => {
      const result = await database.query(
        "SELECT name FROM storage.objects WHERE bucket_id = 'report-images' ORDER BY name"
      );
      return result.rows.map(row => row.name);
    },
    `INSERT INTO public.reports
       (user_id, type, title, category, description, location, date, image_url, status)
     VALUES
       ('${STUDENT_A}', 'found', 'Misattributed image', 'Other', 'Test record.', 'Library',
        '2026-11-04', '${B_ORPHAN}', 'found');`
  );

  assert.equal(names.includes(B_ORPHAN), false);
});

test('match records follow owner rules and expose all rows to admins', async () => {
  assert.deepEqual(await visibleMatchIds(STUDENT_A), [M1, M2]);
  assert.deepEqual(await visibleMatchIds(STUDENT_B), [M1, M2, M3]);
  assert.deepEqual(await visibleMatchIds(ADMIN_ID), [M1, M2, M3]);
});

test('only app_metadata role=admin grants the server-side admin claim', async () => {
  const studentClaim = await withRole(STUDENT_A, async () => {
    const result = await database.query('SELECT public.is_current_user_admin() AS is_admin');
    return result.rows[0].is_admin;
  });
  assert.equal(studentClaim, false);

  const adminClaim = await withRole(ADMIN_ID, async () => {
    const result = await database.query('SELECT public.is_current_user_admin() AS is_admin');
    return result.rows[0].is_admin;
  });
  assert.equal(adminClaim, true);

  await assert.rejects(
    withRole(STUDENT_A, async () => {
      await database.query(
        `UPDATE auth.users
         SET raw_app_meta_data = '{"role":"admin"}'::jsonb
         WHERE id = $1`,
        [STUDENT_A]
      );
    })
  );
});

test('college email enforcement applies to new accounts without ejecting existing users', async () => {
  const legacy = await database.query(
    'SELECT email FROM auth.users WHERE id = $1',
    [LEGACY_ID]
  );
  assert.equal(legacy.rows[0].email, 'legacy@old.example');

  await database.exec('BEGIN');
  try {
    await assert.rejects(
      database.query(
        `INSERT INTO auth.users (id, email)
         VALUES (gen_random_uuid(), 'student@gmail.com')`
      )
    );
  } finally {
    await database.exec('ROLLBACK');
  }

  await database.exec('BEGIN');
  try {
    await database.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data)
       VALUES ($1, '  22CS1042@SGUK.AC.IN ', '"not-an-object"'::jsonb)`,
      [NEW_USER_ID]
    );

    const created = await database.query(
      "SELECT email, raw_user_meta_data->>'prn' AS prn FROM auth.users WHERE id = $1",
      [NEW_USER_ID]
    );

    assert.equal(created.rows[0].email, '22cs1042@sguk.ac.in');
    assert.equal(created.rows[0].prn, '22cs1042');

    await database.query(
      `INSERT INTO auth.users (id, email, raw_app_meta_data)
       VALUES ($1, 'operations@campus.example', '{"role":"admin"}'::jsonb)`,
      [ADMIN_PROVISION_ID]
    );

    const provisioned = await database.query(
      'SELECT email FROM auth.users WHERE id = $1',
      [ADMIN_PROVISION_ID]
    );
    assert.equal(provisioned.rows[0].email, 'operations@campus.example');
  } finally {
    await database.exec('ROLLBACK');
  }
});

test('rollback restores the pre-hardening policies in a transaction', async () => {
  const rollbackSql = await readFile(rollbackPath, 'utf8');

  await database.exec('BEGIN');
  try {
    await database.exec(rollbackSql);

    const reportPolicies = await database.query(
      "SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reports'"
    );
    const reportPolicyNames = reportPolicies.rows.map(row => row.policyname);
    assert.ok(reportPolicyNames.includes('Reports are readable by authenticated users'));
    assert.ok(!reportPolicyNames.includes('Resolved reports require administrator access'));

    const storagePolicies = await database.query(
      "SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'"
    );
    const storagePolicyNames = storagePolicies.rows.map(row => row.policyname);
    assert.ok(storagePolicyNames.includes('Authenticated students can view report images'));
    assert.ok(!storagePolicyNames.includes('Report image visibility is restricted'));

    const helperFunctions = await database.query(
      "SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('is_current_user_admin', 'can_access_report_image')"
    );
    assert.equal(helperFunctions.rows.length, 0);
  } finally {
    await database.exec('ROLLBACK');
  }
});
