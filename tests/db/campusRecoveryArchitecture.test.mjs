import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const hardeningMigrationPath = fileURLToPath(
  new URL('../../supabase/migrations/20261113120000_stage_ready_access_hardening.sql', import.meta.url)
);
const architectureMigrationPath = fileURLToPath(
  new URL('../../supabase/migrations/20261113160000_campus_recovery_handover_architecture.sql', import.meta.url)
);
const architectureRollbackPath = fileURLToPath(
  new URL('../../supabase/rollback/20261113160000_campus_recovery_handover_architecture_rollback.sql', import.meta.url)
);

const STUDENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STUDENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADMIN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DESK_OP_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SUSPENDED_USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are readable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
`;

const database = new PGlite();

const setAuthUser = async (userId, roleName = 'student') => {
  if (userId) {
    const claims = {
      sub: userId,
      role: 'authenticated',
      app_metadata: { role: roleName }
    };
    await database.query(
      "SELECT set_config('request.jwt.claims', $1::text, true)",
      [JSON.stringify(claims)]
    );
    await database.exec('SET LOCAL ROLE authenticated');
  } else {
    await database.query("SELECT set_config('request.jwt.claims', '', true)");
    await database.exec('SET LOCAL ROLE anon');
  }
};

const withRole = async (userId, callback, roleName = 'student') => {
  await database.exec('BEGIN');
  try {
    await setAuthUser(userId, roleName);
    return await callback();
  } finally {
    await database.exec('ROLLBACK');
  }
};

test.before(async () => {
  const hardeningSql = await readFile(hardeningMigrationPath, 'utf8');
  const architectureSql = await readFile(architectureMigrationPath, 'utf8');

  await database.exec(fixtureSql);
  await database.exec(hardeningSql);
  await database.exec(architectureSql);

  // Seed baseline users
  await database.exec(`
    -- Pre-populate staff allowlist for desk operator
    INSERT INTO public.staff_allowlist (email, name, department, role)
    VALUES ('desk.operator@sguk.ac.in', 'Desk Operator', 'Campus Security', 'desk_operator');

    INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data) VALUES
      ('${STUDENT_A}', '242631001@sguk.ac.in', '{"name":"Student A"}'::jsonb, '{}'::jsonb),
      ('${STUDENT_B}', '242631002@sguk.ac.in', '{"name":"Student B"}'::jsonb, '{}'::jsonb),
      ('${ADMIN_ID}', 'vachannoubade@gmail.com', '{"name":"Admin Yugank"}'::jsonb, '{"role":"admin"}'::jsonb),
      ('${DESK_OP_ID}', 'desk.operator@sguk.ac.in', '{"name":"Desk Operator"}'::jsonb, '{"role":"desk_operator"}'::jsonb),
      ('${SUSPENDED_USER_ID}', '242631099@sguk.ac.in', '{"name":"Suspended Student"}'::jsonb, '{}'::jsonb);

    INSERT INTO public.profiles (id, name) VALUES
      ('${STUDENT_A}', 'Student A'),
      ('${STUDENT_B}', 'Student B'),
      ('${ADMIN_ID}', 'Admin Yugank'),
      ('${DESK_OP_ID}', 'Desk Operator'),
      ('${SUSPENDED_USER_ID}', 'Suspended Student');

    -- Suspend one membership for testing
    UPDATE public.campus_memberships SET status = 'SUSPENDED' WHERE user_id = '${SUSPENDED_USER_ID}';
  `);
});

test.after(async () => {
  await database.close();
});

test('1. Admin identity: vachannoubade@gmail.com is restricted to trusted server administration only', async () => {
  // Public signup of vachannoubade@gmail.com WITHOUT role=admin is REJECTED
  await database.exec('BEGIN');
  try {
    await assert.rejects(
      database.query(
        "INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES (gen_random_uuid(), 'vachannoubade@gmail.com', '{}'::jsonb)"
      ),
      /The administrator account can only be provisioned through secure server administration/i
    );
  } finally {
    await database.exec('ROLLBACK');
  }

  // Provisioning with role=admin succeeds
  await database.exec('BEGIN');
  try {
    const adminId = '90000000-0000-4000-8000-000000000001';
    await database.query(
      "INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES ($1, 'vachannoubade@gmail.com', '{\"role\":\"admin\"}'::jsonb)",
      [adminId]
    );
    const membership = await database.query(
      "SELECT membership_type, status FROM public.campus_memberships WHERE user_id = $1",
      [adminId]
    );
    assert.equal(membership.rows[0].membership_type, 'admin');
    assert.equal(membership.rows[0].status, 'ACTIVE');
  } finally {
    await database.exec('ROLLBACK');
  }
});

test('2. Staff Allowlist: Only approved staff can register with non-PRN emails', async () => {
  await database.exec('BEGIN');
  try {
    // Add staff to allowlist
    await database.query(`
      INSERT INTO public.staff_allowlist (email, name, department, role)
      VALUES ('faculty.advisor@sguk.ac.in', 'Dr. Sharma', 'Computer Science', 'staff');
    `);

    // Approved staff signup succeeds
    const staffId = '90000000-0000-4000-8000-000000000002';
    await database.query(
      "INSERT INTO auth.users (id, email) VALUES ($1, 'faculty.advisor@sguk.ac.in')",
      [staffId]
    );

    const membership = await database.query(
      "SELECT membership_type FROM public.campus_memberships WHERE user_id = $1",
      [staffId]
    );
    assert.equal(membership.rows[0].membership_type, 'staff');

    // Unapproved staff email is rejected
    await assert.rejects(
      database.query(
        "INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'unknown.prof@sguk.ac.in')"
      ),
      /Only SGUK students with a valid numeric PRN email/i
    );
  } finally {
    await database.exec('ROLLBACK');
  }
});

test('3. Server-side report creation enforces input limits and rate limits', async () => {
  // Enforces title length 5-70 chars
  await assert.rejects(
    withRole(STUDENT_A, async () => {
      await database.query(
        "SELECT public.create_report_secure('lost', 'Key', 'Keys', 'My brass dorm key', 'Hostel A', '2026-11-01')"
      );
    }),
    /Title must be between 5 and 70 characters/i
  );

  // Enforces description word count <= 100 (using short words so length <= 700)
  const longWords = Array(105).fill('word').join(' ');
  await assert.rejects(
    withRole(STUDENT_A, async () => {
      await database.query(
        "SELECT public.create_report_secure('lost', 'Valid Title Length', 'Keys', $1, 'Hostel A', '2026-11-01')",
        [longWords]
      );
    }),
    /exceeds maximum allowed word count of 100 words/i
  );

  // Valid report creation succeeds
  await withRole(STUDENT_A, async () => {
    const res = await database.query(
      "SELECT public.create_report_secure('lost', 'Blue Backpack with Laptop', 'Bags', 'Left on the 2nd floor quiet study table.', 'Main Library', '2026-11-01', 'Wildcraft', 'Navy Blue', 'National park badge on strap', 'Main Library', 'with_finder', NULL, 'Serial number SN88921 on bottom zipper') AS id"
    );
    assert.ok(res.rows[0].id);

    // Private evidence is stored in public.report_private_details and NOT in public.reports public columns
    const privateRow = await database.query(
      "SELECT private_detail FROM public.report_private_details WHERE report_id = $1",
      [res.rows[0].id]
    );
    assert.equal(privateRow.rows[0].private_detail, 'Serial number SN88921 on bottom zipper');
  });
});

test('4. Rate limiting: Enforces max 3 reports per hour per user', async () => {
  await database.exec('BEGIN');
  try {
    await setAuthUser(STUDENT_A, 'student');
    // 3 reports succeed
    for (let i = 1; i <= 3; i++) {
      await database.query(
        "SELECT public.check_and_record_rate_limit('new_report')"
      );
    }

    // 4th report fails rate limit
    await assert.rejects(
      database.query(
        "SELECT public.check_and_record_rate_limit('new_report')"
      ),
      /Rate limit exceeded: You can submit at most 3 reports per hour/i
    );
  } finally {
    await database.exec('ROLLBACK');
  }
});

test('5. Claims & Handover Workflow: One active claim, competing claims trigger dispute, desk completes handover', async () => {
  await database.exec('BEGIN');
  try {
    // Student B creates a found report
    const foundReportId = '70000000-0000-4000-8000-000000000001';
    await database.query(`
      INSERT INTO public.reports (id, user_id, type, title, category, description, location, date, status)
      VALUES ('${foundReportId}', '${STUDENT_B}', 'found', 'Black Leather Wallet', 'Accessories', 'Found near cafeteria bench', 'Central Cafeteria', '2026-11-02', 'found');
    `);

    // Student A submits a claim
    await setAuthUser(STUDENT_A, 'student');
    const resA = await database.query(
      "SELECT public.submit_claim_secure($1, 'Has my college ID card inside with PRN 242631001 and cash') AS id",
      [foundReportId]
    );
    const claimAId = resA.rows[0].id;
    assert.ok(claimAId);

    // Duplicate active claim by Student A is rejected
    await database.exec('SAVEPOINT sp_claim;');
    try {
      await assert.rejects(
        database.query(
          "SELECT public.submit_claim_secure($1, 'Submitting again with more info about my wallet')",
          [foundReportId]
        ),
        /You already have an active claim submitted for this item/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_claim;');
    }

    // Student C (or Admin testing) submits competing claim -> triggers DISPUTED status
    await setAuthUser(ADMIN_ID, 'admin');
    const resB = await database.query(
      "SELECT public.submit_claim_secure($1, 'It belongs to my department colleague Dr Rao') AS id",
      [foundReportId]
    );
    const claimBId = resB.rows[0].id;
    assert.ok(claimBId);

    // Both claims should now be DISPUTED for administrative resolution
    const claims = await database.query(
      "SELECT id, status FROM public.claims WHERE found_report_id = $1",
      [foundReportId]
    );
    assert.equal(claims.rows.every(c => c.status === 'DISPUTED'), true);

    // Student cannot authorize handover
    await setAuthUser(STUDENT_A, 'student');
    await database.exec('SAVEPOINT sp_handover;');
    try {
      await assert.rejects(
        database.query(
          "SELECT public.complete_handover_resolution($1, 'Central Helpdesk', 'Good condition', true)",
          [claimAId]
        ),
        /Only authorized desk operators or administrators can authorize physical handovers/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_handover;');
    }

    // Authorized Desk Operator completes physical handover
    await setAuthUser(DESK_OP_ID, 'desk_operator');
    const resolution = await database.query(
      "SELECT public.complete_handover_resolution($1, 'Central Helpdesk', 'ID physically checked, cash intact', true) AS result",
      [claimAId]
    );
    assert.equal(resolution.rows[0].result.success, true);

    // Found report is resolved (checked by Admin since resolved reports are restricted from non-admin users)
    await setAuthUser(ADMIN_ID, 'admin');
    const reportStatus = await database.query(
      "SELECT status, custody_status FROM public.reports WHERE id = $1",
      [foundReportId]
    );
    assert.equal(reportStatus.rows[0].status, 'resolved');
    assert.equal(reportStatus.rows[0].custody_status, 'desk_custody_confirmed');

    // Claim A is resolved
    const claimA = await database.query("SELECT status FROM public.claims WHERE id = $1", [claimAId]);
    assert.equal(claimA.rows[0].status, 'RESOLVED');

    // Competing claim was rejected
    const otherClaims = await database.query(
      "SELECT status FROM public.claims WHERE found_report_id = $1 AND id <> $2",
      [foundReportId, claimAId]
    );
    assert.equal(otherClaims.rows[0].status, 'REJECTED');
  } finally {
    await database.exec('ROLLBACK');
  }
});

test('6. Suspended account cannot create reports or submit claims', async () => {
  await assert.rejects(
    withRole(SUSPENDED_USER_ID, async () => {
      await database.query(
        "SELECT public.create_report_secure('lost', 'Watch Titanium Case', 'Accessories', 'Lost near sports complex', 'Sports Complex', '2026-11-03')"
      );
    }),
    /Your campus account is not active/i
  );
});

test('7. Rollback restores the pre-architecture schema cleanly', async () => {
  const rollbackSql = await readFile(architectureRollbackPath, 'utf8');

  await database.exec('BEGIN');
  try {
    await database.exec(rollbackSql);

    const tables = await database.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('campus_memberships', 'staff_allowlist', 'claims', 'handover_records', 'campus_desks')
    `);
    assert.equal(tables.rows.length, 0);

    const funcs = await database.query(`
      SELECT proname FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('complete_handover_resolution', 'submit_claim_secure', 'create_report_secure')
    `);
    assert.equal(funcs.rows.length, 0);
  } finally {
    await database.exec('ROLLBACK');
  }
});
