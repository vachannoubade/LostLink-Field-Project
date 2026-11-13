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
const provisionAdminPath = fileURLToPath(
  new URL('../../supabase/provision_admin.sql', import.meta.url)
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

GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  email_confirmed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
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

CREATE POLICY "Users can create their own reports"
  ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reports"
  ON public.reports FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;

-- Historical production contract from 20261012163500: returns public.reports
CREATE OR REPLACE FUNCTION public.resolve_report(report_id UUID)
RETURNS public.reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.reports;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_report
  FROM public.reports
  WHERE id = report_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or permission denied';
  END IF;

  IF v_report.status = 'resolved' THEN
    RAISE EXCEPTION 'Report is already resolved';
  END IF;

  UPDATE public.reports
  SET status = 'resolved', updated_at = now()
  WHERE id = report_id
  RETURNING * INTO v_report;

  RETURN v_report;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_report(UUID) TO authenticated;
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

test('2. Staff Allowlist: Only approved staff can register with non-PRN emails, user_metadata is ignored', async () => {
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

    // Unapproved student trying to spoof staff via user_metadata gets assigned student role
    const spoofId = '90000000-0000-4000-8000-000000000003';
    await database.query(
      "INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, '242631055@sguk.ac.in', '{\"is_staff\": true, \"role\": \"admin\"}'::jsonb)",
      [spoofId]
    );
    const spoofMembership = await database.query(
      "SELECT membership_type FROM public.campus_memberships WHERE user_id = $1",
      [spoofId]
    );
    assert.equal(spoofMembership.rows[0].membership_type, 'student');

    // Unapproved non-PRN staff email is rejected
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

  // Enforces description word count <= 100
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

test('4. Concurrency-safe rate limiting: enforces quota and rejects unsupported action types', async () => {
  await database.exec('BEGIN');
  try {
    await setAuthUser(STUDENT_A, 'student');

    // Unsupported action type is rejected
    await database.exec('SAVEPOINT sp_unsupported;');
    try {
      await assert.rejects(
        database.query("SELECT public.check_and_record_rate_limit('malicious_action')"),
        /Unsupported rate limit action type/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_unsupported;');
    }

    // 3 reports succeed
    for (let i = 1; i <= 3; i++) {
      await database.query(
        "SELECT public.check_and_record_rate_limit('new_report')"
      );
    }

    // 4th report fails rate limit
    await database.exec('SAVEPOINT sp_rate_limit;');
    try {
      await assert.rejects(
        database.query(
          "SELECT public.check_and_record_rate_limit('new_report')"
        ),
        /Rate limit exceeded: You can submit at most 3 reports per hour/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_rate_limit;');
    }
  } finally {
    await database.exec('ROLLBACK');
  }
});

test('5. Claims & Handover: Direct API mutations revoked, approved claim required for handover', async () => {
  await database.exec('BEGIN');
  try {
    // Student B creates a found report
    await setAuthUser(STUDENT_B, 'student');
    const foundReportId = '70000000-0000-4000-8000-000000000001';
    await database.query(`
      INSERT INTO public.reports (id, user_id, type, title, category, description, location, date, status)
      VALUES ('${foundReportId}', '${STUDENT_B}', 'found', 'Black Leather Wallet', 'Accessories', 'Found near cafeteria bench', 'Central Cafeteria', '2026-11-02', 'found');
    `);

    // Student A direct INSERT into public.claims is denied (must use submit_claim_secure)
    await setAuthUser(STUDENT_A, 'student');
    await database.exec('SAVEPOINT sp_direct_claim;');
    try {
      await assert.rejects(
        database.query(
          "INSERT INTO public.claims (found_report_id, claimant_id, claim_evidence, status) VALUES ($1, $2, 'Direct bypass attempt', 'APPROVED_FOR_HANDOVER')",
          [foundReportId, STUDENT_A]
        ),
        /permission denied for table claims/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_direct_claim;');
    }

    // Student A submits a legitimate claim via secure RPC
    const resA = await database.query(
      "SELECT public.submit_claim_secure($1, 'Has my college ID card inside with PRN 242631001 and cash') AS id",
      [foundReportId]
    );
    const claimAId = resA.rows[0].id;
    assert.ok(claimAId);

    // Direct UPDATE on claims table is denied (claimant cannot approve their own claim)
    await database.exec('SAVEPOINT sp_direct_update;');
    try {
      await assert.rejects(
        database.query(
          "UPDATE public.claims SET status = 'APPROVED_FOR_HANDOVER' WHERE id = $1",
          [claimAId]
        ),
        /permission denied for table claims/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_direct_update;');
    }

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

    // Competing claim submits -> triggers DISPUTED status
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

    // Desk operator CANNOT complete handover for a DISPUTED claim
    await setAuthUser(DESK_OP_ID, 'desk_operator');
    await database.exec('SAVEPOINT sp_handover_disputed;');
    try {
      await assert.rejects(
        database.query(
          "SELECT public.complete_handover_resolution($1, 'Central Helpdesk', 'ID physically checked', true)",
          [claimAId]
        ),
        /Cannot complete handover: Claim is disputed/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_handover_disputed;');
    }

    // Desk operator explicitly reviews and approves Claim A for handover
    await database.query(
      "SELECT public.review_claim_status($1, 'APPROVED_FOR_HANDOVER', 'Verified student PRN and ID match')",
      [claimAId]
    );

    const approvedClaim = await database.query("SELECT status FROM public.claims WHERE id = $1", [claimAId]);
    assert.equal(approvedClaim.rows[0].status, 'APPROVED_FOR_HANDOVER');

    // Competing claim was automatically rejected
    const rejectedClaim = await database.query("SELECT status FROM public.claims WHERE id = $1", [claimBId]);
    assert.equal(rejectedClaim.rows[0].status, 'REJECTED');

    // Handover rejected if physical identity is not verified
    await database.exec('SAVEPOINT sp_unverified_id;');
    try {
      await assert.rejects(
        database.query(
          "SELECT public.complete_handover_resolution($1, 'Central Helpdesk', 'ID checked', false)",
          [claimAId]
        ),
        /Student identity and PRN must be physically verified/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_unverified_id;');
    }

    // Authorized Desk Operator completes physical handover
    const resolution = await database.query(
      "SELECT public.complete_handover_resolution($1, 'Central Helpdesk', 'ID physically checked, cash intact', true) AS result",
      [claimAId]
    );
    assert.equal(resolution.rows[0].result.success, true);

    // Duplicate handover on the same found item is rejected
    await database.exec('SAVEPOINT sp_dup_handover;');
    try {
      await assert.rejects(
        database.query(
          "SELECT public.complete_handover_resolution($1, 'Central Helpdesk', 'Another handover attempt', true)",
          [claimAId]
        ),
        /Handover has already been completed for this claim/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_dup_handover;');
    }

    // Found report is resolved
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
  } finally {
    await database.exec('ROLLBACK');
  }
});

test('6. Universal Membership Revocation: Suspended and revoked users lose report, image, and claim access', async () => {
  await database.exec('BEGIN');
  try {
    // Create an active report by Student A
    await setAuthUser(STUDENT_A, 'student');
    const activeReportId = '70000000-0000-4000-8000-000000000002';
    await database.query(`
      INSERT INTO public.reports (id, user_id, type, title, category, description, location, date, status, image_url)
      VALUES ('${activeReportId}', '${STUDENT_A}', 'lost', 'Scientific Calculator', 'Electronics', 'Casio fx-991EX', 'Engineering Block', '2026-11-03', 'lost', '${STUDENT_A}/calc.jpg');
    `);

    // Suspended student gets 0 rows on SELECT reports due to restrictive active membership policy
    await setAuthUser(SUSPENDED_USER_ID, 'student');
    const visibleReports = await database.query("SELECT id FROM public.reports WHERE id = $1", [activeReportId]);
    assert.equal(visibleReports.rows.length, 0);

    // Suspended student denied image access
    const canAccessImage = await database.query(
      "SELECT public.can_access_report_image($1) AS allowed",
      [`${STUDENT_A}/calc.jpg`]
    );
    assert.equal(canAccessImage.rows[0].allowed, false);

    // Suspended user cannot submit report
    await database.exec('SAVEPOINT sp_susp_report;');
    try {
      await assert.rejects(
        database.query(
          "SELECT public.create_report_secure('lost', 'Watch Titanium Case', 'Accessories', 'Lost near sports complex', 'Sports Complex', '2026-11-03')"
        ),
        /Your campus account is not active/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_susp_report;');
    }

    // Suspended user cannot submit claim
    await database.exec('SAVEPOINT sp_susp_claim;');
    try {
      await assert.rejects(
        database.query(
          "SELECT public.submit_claim_secure($1, 'This is my calculator left in hall')",
          [activeReportId]
        ),
        /Active campus account required/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_susp_claim;');
    }

    // Student direct modification of campus_memberships is denied
    await database.exec('SAVEPOINT sp_tamper_membership;');
    try {
      await assert.rejects(
        database.query(`
          UPDATE public.campus_memberships SET status = 'REVOKED' WHERE user_id = '${ADMIN_ID}';
        `),
        /permission denied for table campus_memberships/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_tamper_membership;');
    }

    // Server administrative update revokes admin's membership
    await database.exec('RESET ROLE');
    await database.query(`
      UPDATE public.campus_memberships SET status = 'REVOKED' WHERE user_id = '${ADMIN_ID}';
    `);
    await setAuthUser(ADMIN_ID, 'admin');
    const isAdmin = await database.query("SELECT public.is_current_user_admin() AS is_admin");
    assert.equal(isAdmin.rows[0].is_admin, false);
  } finally {
    await database.exec('ROLLBACK');
  }
});

test('7. can_access_admin_portal() server-side authorization security check', async () => {
  await database.exec('BEGIN');
  try {
    // 1. Authorized Active Admin passes
    await setAuthUser(ADMIN_ID, 'admin');
    const adminCheck = await database.query("SELECT public.can_access_admin_portal() AS allowed;");
    assert.equal(adminCheck.rows[0].allowed, true);

    // 2. Student is rejected
    await setAuthUser(STUDENT_A, 'student');
    const studentCheck = await database.query("SELECT public.can_access_admin_portal() AS allowed;");
    assert.equal(studentCheck.rows[0].allowed, false);

    // 3. Desk Operator is rejected (portal is reserved for trusted admin role)
    await setAuthUser(DESK_OP_ID, 'desk_operator');
    const deskCheck = await database.query("SELECT public.can_access_admin_portal() AS allowed;");
    assert.equal(deskCheck.rows[0].allowed, false);

    // 4. Suspended admin is rejected immediately
    await database.exec('RESET ROLE');
    await database.query(`UPDATE public.campus_memberships SET status = 'SUSPENDED' WHERE user_id = '${ADMIN_ID}';`);
    await setAuthUser(ADMIN_ID, 'admin');
    const suspendedCheck = await database.query("SELECT public.can_access_admin_portal() AS allowed;");
    assert.equal(suspendedCheck.rows[0].allowed, false);

    // 5. Expired admin is rejected
    await database.exec('RESET ROLE');
    await database.query(`UPDATE public.campus_memberships SET status = 'ACTIVE', expires_at = now() - interval '1 day' WHERE user_id = '${ADMIN_ID}';`);
    await setAuthUser(ADMIN_ID, 'admin');
    const expiredCheck = await database.query("SELECT public.can_access_admin_portal() AS allowed;");
    assert.equal(expiredCheck.rows[0].allowed, false);

    // 6. Restore active status
    await database.exec('RESET ROLE');
    await database.query(`UPDATE public.campus_memberships SET status = 'ACTIVE', expires_at = NULL WHERE user_id = '${ADMIN_ID}';`);

    // 7. Forged student JWT claiming role 'admin' while db user has role 'student' is rejected
    const forgedClaims = {
      sub: STUDENT_A,
      role: 'authenticated',
      app_metadata: { role: 'admin' }
    };
    await database.query("SELECT set_config('request.jwt.claims', $1::text, true)", [JSON.stringify(forgedClaims)]);
    await database.exec('SET LOCAL ROLE authenticated');
    const forgedCheck = await database.query("SELECT public.can_access_admin_portal() AS allowed;");
    assert.equal(forgedCheck.rows[0].allowed, false);

    // 8. Anonymous caller has EXECUTE permission revoked and is denied immediately
    await setAuthUser(null);
    await assert.rejects(
      database.query("SELECT public.can_access_admin_portal() AS allowed;"),
      /permission denied for function can_access_admin_portal/i
    );
  } finally {
    await database.exec('ROLLBACK');
  }
});

test('8. PostgreSQL migration contract: resolve_report preserves RETURNS public.reports', async () => {
  await database.exec('BEGIN');
  try {
    // 1. Check function signature in pg_proc
    const returnTypeQuery = await database.query(`
      SELECT t.typname
      FROM pg_proc p
      JOIN pg_type t ON p.prorettype = t.oid
      WHERE p.proname = 'resolve_report' AND p.pronamespace = 'public'::regnamespace;
    `);
    assert.equal(returnTypeQuery.rows.length, 1);
    assert.equal(returnTypeQuery.rows[0].typname, 'reports');

    // 2. Report owner can resolve report and receives the updated report record
    await setAuthUser(STUDENT_A, 'student');
    const reportId = '80000000-0000-4000-8000-000000000001';
    await database.query(`
      INSERT INTO public.reports (id, user_id, type, title, category, description, location, date, status)
      VALUES ('${reportId}', '${STUDENT_A}', 'lost', 'Scientific Calculator', 'Electronics', 'Lost in Main Auditorium', 'Main Audi', '2026-11-01', 'lost');
    `);

    const result = await database.query("SELECT (public.resolve_report($1)).status AS status;", [reportId]);
    assert.equal(result.rows[0].status, 'resolved');

    // 3. Non-owner and non-admin cannot resolve
    await setAuthUser(STUDENT_B, 'student');
    await assert.rejects(
      database.query("SELECT public.resolve_report($1);", [reportId]),
      /Permission denied: You can only resolve your own reports/i
    );
  } finally {
    await database.exec('ROLLBACK');
  }
});

test('9. Server-side Administrative Management RPCs: staff allowlist, membership status, and desk operator role', async () => {
  await database.exec('BEGIN');
  try {
    // 1. admin_add_staff_allowlist
    // As Administrator: succeeds and creates audit log
    await setAuthUser(ADMIN_ID, 'admin');
    const addStaffResult = await database.query(`
      SELECT public.admin_add_staff_allowlist('prof.verma@sguk.ac.in', 'Prof. Verma', 'Physics', 'staff') AS entry_id;
    `);
    const staffEntryId = addStaffResult.rows[0].entry_id;
    assert.ok(staffEntryId);

    const allowlistCheck = await database.query("SELECT name, is_active FROM public.staff_allowlist WHERE id = $1;", [staffEntryId]);
    assert.equal(allowlistCheck.rows[0].name, 'Prof. Verma');
    assert.equal(allowlistCheck.rows[0].is_active, true);

    const auditStaffAdd = await database.query("SELECT action FROM public.audit_logs WHERE action = 'STAFF_ALLOWLIST_UPSERTED' AND entity_id = $1;", [staffEntryId]);
    assert.equal(auditStaffAdd.rows.length, 1);

    // As Student: denied
    await setAuthUser(STUDENT_A, 'student');
    await database.exec('SAVEPOINT sp_admin_add;');
    try {
      await assert.rejects(
        database.query("SELECT public.admin_add_staff_allowlist('hacker@sguk.ac.in', 'Hacker', 'IT', 'staff');"),
        /Access denied: Authoritative administrator privileges required/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_admin_add;');
    }

    // 2. admin_toggle_staff_allowlist
    // As Administrator: can deactivate and reactivate
    await setAuthUser(ADMIN_ID, 'admin');
    await database.query("SELECT public.admin_toggle_staff_allowlist($1, false);", [staffEntryId]);
    const deactivated = await database.query("SELECT is_active FROM public.staff_allowlist WHERE id = $1;", [staffEntryId]);
    assert.equal(deactivated.rows[0].is_active, false);

    // As Student: denied
    await setAuthUser(STUDENT_A, 'student');
    await database.exec('SAVEPOINT sp_admin_toggle;');
    try {
      await assert.rejects(
        database.query("SELECT public.admin_toggle_staff_allowlist($1, true);", [staffEntryId]),
        /Access denied: Authoritative administrator privileges required/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_admin_toggle;');
    }

    // 3. admin_set_membership_status
    // As Administrator: can suspend student membership
    await setAuthUser(ADMIN_ID, 'admin');
    await database.query("SELECT public.admin_set_membership_status($1, 'SUSPENDED', 'Honor code investigation');", [STUDENT_A]);
    const memStatus = await database.query("SELECT status FROM public.campus_memberships WHERE user_id = $1;", [STUDENT_A]);
    assert.equal(memStatus.rows[0].status, 'SUSPENDED');

    // Administrator cannot suspend themselves
    await database.exec('SAVEPOINT sp_admin_self_susp;');
    try {
      await assert.rejects(
        database.query("SELECT public.admin_set_membership_status($1, 'SUSPENDED');", [ADMIN_ID]),
        /Cannot suspend or revoke your own active administrator account/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_admin_self_susp;');
    }

    // Reactivate student
    await database.query("SELECT public.admin_set_membership_status($1, 'ACTIVE', 'Reinstated');", [STUDENT_A]);
    const memActive = await database.query("SELECT status FROM public.campus_memberships WHERE user_id = $1;", [STUDENT_A]);
    assert.equal(memActive.rows[0].status, 'ACTIVE');

    // As Student: denied
    await setAuthUser(STUDENT_A, 'student');
    await database.exec('SAVEPOINT sp_student_set_status;');
    try {
      await assert.rejects(
        database.query("SELECT public.admin_set_membership_status($1, 'SUSPENDED');", [STUDENT_B]),
        /Access denied: Authoritative administrator privileges required/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_student_set_status;');
    }

    // 4. admin_set_membership_role
    // As Administrator: can promote student to desk_operator
    await setAuthUser(ADMIN_ID, 'admin');
    await database.query("SELECT public.admin_set_membership_role($1, 'desk_operator', 'Campus helpdesk staff assignment');", [STUDENT_A]);
    const memRole = await database.query("SELECT membership_type FROM public.campus_memberships WHERE user_id = $1;", [STUDENT_A]);
    assert.equal(memRole.rows[0].membership_type, 'desk_operator');

    // Can demote back to student
    await database.query("SELECT public.admin_set_membership_role($1, 'student', 'Rotated off helpdesk duty');", [STUDENT_A]);
    const memRoleDemoted = await database.query("SELECT membership_type FROM public.campus_memberships WHERE user_id = $1;", [STUDENT_A]);
    assert.equal(memRoleDemoted.rows[0].membership_type, 'student');

    // Cannot set admin role through this RPC
    await database.exec('SAVEPOINT sp_admin_role_escalate;');
    try {
      await assert.rejects(
        database.query("SELECT public.admin_set_membership_role($1, 'admin');", [STUDENT_A]),
        /Invalid role assignment: must be student, staff, or desk_operator/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_admin_role_escalate;');
    }

    // As Student: denied
    await setAuthUser(STUDENT_A, 'student');
    await database.exec('SAVEPOINT sp_student_set_role;');
    try {
      await assert.rejects(
        database.query("SELECT public.admin_set_membership_role($1, 'desk_operator');", [STUDENT_B]),
        /Access denied: Authoritative administrator privileges required/i
      );
    } finally {
      await database.exec('ROLLBACK TO SAVEPOINT sp_student_set_role;');
    }
  } finally {
    await database.exec('ROLLBACK');
  }
});

test('10. Unified administrator authorization: is_current_user_admin() fails closed', async () => {
  await database.exec('BEGIN');
  try {
    // 1. Active administrator with active admin membership passes
    await setAuthUser(ADMIN_ID, 'admin');
    const validAdmin = await database.query("SELECT public.is_current_user_admin() AS is_admin;");
    assert.equal(validAdmin.rows[0].is_admin, true);

    // 2. Fails closed when membership is absent
    const phantomAdminId = '99999999-9999-4999-8999-999999999999';
    await database.exec('RESET ROLE');
    await database.exec(`
      INSERT INTO auth.users (id, email, raw_app_meta_data)
      VALUES ('${phantomAdminId}', '242631088@sguk.ac.in', '{"role":"admin"}'::jsonb);
    `);
    await database.exec(`
      DELETE FROM public.campus_memberships WHERE user_id = '${phantomAdminId}';
    `);
    await setAuthUser(phantomAdminId, 'admin');
    const noMembership = await database.query("SELECT public.is_current_user_admin() AS is_admin;");
    assert.equal(noMembership.rows[0].is_admin, false);

    // 3. Fails closed when membership is SUSPENDED
    await database.exec('RESET ROLE');
    await database.query(`UPDATE public.campus_memberships SET status = 'SUSPENDED' WHERE user_id = '${ADMIN_ID}';`);
    await setAuthUser(ADMIN_ID, 'admin');
    const suspendedAdmin = await database.query("SELECT public.is_current_user_admin() AS is_admin;");
    assert.equal(suspendedAdmin.rows[0].is_admin, false);

    // 4. Fails closed when membership is REVOKED
    await database.exec('RESET ROLE');
    await database.query(`UPDATE public.campus_memberships SET status = 'REVOKED' WHERE user_id = '${ADMIN_ID}';`);
    await setAuthUser(ADMIN_ID, 'admin');
    const revokedAdmin = await database.query("SELECT public.is_current_user_admin() AS is_admin;");
    assert.equal(revokedAdmin.rows[0].is_admin, false);

    // 5. Fails closed when membership has expired
    await database.exec('RESET ROLE');
    await database.query(`UPDATE public.campus_memberships SET status = 'ACTIVE', expires_at = now() - interval '1 hour' WHERE user_id = '${ADMIN_ID}';`);
    await setAuthUser(ADMIN_ID, 'admin');
    const expiredAdmin = await database.query("SELECT public.is_current_user_admin() AS is_admin;");
    assert.equal(expiredAdmin.rows[0].is_admin, false);

    // 6. Fails closed when membership_type is not 'admin'
    await database.exec('RESET ROLE');
    await database.query(`UPDATE public.campus_memberships SET status = 'ACTIVE', expires_at = NULL, membership_type = 'staff' WHERE user_id = '${ADMIN_ID}';`);
    await setAuthUser(ADMIN_ID, 'admin');
    const nonAdminType = await database.query("SELECT public.is_current_user_admin() AS is_admin;");
    assert.equal(nonAdminType.rows[0].is_admin, false);

    // 7. Fails closed when role is removed from app_metadata
    await database.exec('RESET ROLE');
    await database.query(`UPDATE public.campus_memberships SET status = 'ACTIVE', expires_at = NULL, membership_type = 'admin' WHERE user_id = '${ADMIN_ID}';`);
    await database.query(`UPDATE auth.users SET raw_app_meta_data = '{}'::jsonb WHERE id = '${ADMIN_ID}';`);
    await setAuthUser(ADMIN_ID, 'admin');
    const noRoleClaim = await database.query("SELECT public.is_current_user_admin() AS is_admin;");
    assert.equal(noRoleClaim.rows[0].is_admin, false);
  } finally {
    await database.exec('ROLLBACK');
  }
});

test('11. Safe, idempotent initial admin provisioning script (provision_admin.sql)', async () => {
  const provisionSql = await readFile(provisionAdminPath, 'utf8');

  // Verify email preservation on unconfirmed account
  const initialEmailCheck = await database.query(`SELECT email_confirmed_at FROM auth.users WHERE lower(email) = 'vachannoubade@gmail.com';`);
  const initialConfirmedState = initialEmailCheck.rows[0].email_confirmed_at;

  // Run provision_admin.sql
  await database.exec(provisionSql);

  const userRow = await database.query(`
    SELECT email, email_confirmed_at, raw_app_meta_data
    FROM auth.users
    WHERE lower(email) = 'vachannoubade@gmail.com'
  `);
  assert.equal(userRow.rows.length, 1);
  assert.equal(userRow.rows[0].email_confirmed_at, initialConfirmedState); // Preserved!
  assert.equal(userRow.rows[0].raw_app_meta_data.role, 'admin');

  // Verify admin_provisioned_at is a real ISO timestamp string, not the string "now()"
  const provisionedAt = userRow.rows[0].raw_app_meta_data.admin_provisioned_at;
  assert.notEqual(provisionedAt, 'now()');
  assert.match(provisionedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

  // Verify campus_memberships record
  const memberRow = await database.query(`
    SELECT membership_type, status, expires_at
    FROM public.campus_memberships
    WHERE user_id = '${ADMIN_ID}'
  `);
  assert.equal(memberRow.rows.length, 1);
  assert.equal(memberRow.rows[0].membership_type, 'admin');
  assert.equal(memberRow.rows[0].status, 'ACTIVE');

  // Count audit logs after first run
  const auditCount1 = await database.query(`
    SELECT count(*) AS cnt FROM public.audit_logs WHERE action = 'ADMIN_PROVISIONED' AND actor_id = '${ADMIN_ID}';
  `);

  // Run provision_admin.sql a second time (must be completely idempotent)
  await database.exec(provisionSql);

  const auditCount2 = await database.query(`
    SELECT count(*) AS cnt FROM public.audit_logs WHERE action = 'ADMIN_PROVISIONED' AND actor_id = '${ADMIN_ID}';
  `);
  assert.equal(auditCount2.rows[0].cnt, auditCount1.rows[0].cnt); // No duplicate audit entries!

  // Verify admin can access admin portal in an active session
  await database.exec('BEGIN');
  try {
    await setAuthUser(ADMIN_ID, 'admin');
    const canAccess = await database.query("SELECT public.can_access_admin_portal() AS allowed;");
    assert.equal(canAccess.rows[0].allowed, true);
  } finally {
    await database.exec('ROLLBACK');
  }
});

test('12. Rollback safety: Aborts when production data exists, executes cleanly with override', async () => {
  const rollbackSql = await readFile(architectureRollbackPath, 'utf8');

  // Insert a test claim
  await database.exec('BEGIN');
  try {
    await setAuthUser(STUDENT_B, 'student');
    const reportId = '70000000-0000-4000-8000-000000000003';
    await database.query(`
      INSERT INTO public.reports (id, user_id, type, title, category, description, location, date, status)
      VALUES ('${reportId}', '${STUDENT_B}', 'found', 'Car Key Fob', 'Keys', 'Found in parking lot', 'Parking P1', '2026-11-04', 'found');
    `);
    await setAuthUser(STUDENT_A, 'student');
    await database.query(
      "SELECT public.submit_claim_secure($1, 'Honda fob with red lanyard')",
      [reportId]
    );

    // Rollback without override should ABORT
    await assert.rejects(
      database.exec(rollbackSql),
      /SAFETY ABORT: Production data detected/i
    );
  } finally {
    await database.exec('ROLLBACK');
  }

  // Rollback with override succeeds
  await database.exec('BEGIN');
  try {
    await database.exec("SET lostlink.allow_destructive_rollback = 'true'");
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
        AND proname IN (
          'complete_handover_resolution',
          'submit_claim_secure',
          'create_report_secure',
          'admin_add_staff_allowlist',
          'admin_toggle_staff_allowlist',
          'admin_set_membership_status',
          'admin_set_membership_role'
        )
    `);
    assert.equal(funcs.rows.length, 0);
  } finally {
    await database.exec('ROLLBACK');
  }
});
