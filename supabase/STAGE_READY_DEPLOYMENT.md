# LostLink Stage-Ready Deployment & Verification

This runbook covers the two stage-ready security and campus recovery migrations:
1. `supabase/migrations/20261113120000_stage_ready_access_hardening.sql`
2. `supabase/migrations/20261113160000_campus_recovery_handover_architecture.sql`

It is written for a staging project first, with a separate live-deployment gate.

> **Do not apply these migrations to the live project until the staging checks below pass and the change is explicitly approved.**

---

## 1. What the migrations change

### Migration 1: Stage-Ready Access Hardening (`20261113120000`)
- Resolved reports are readable only by administrators.
- Report images are private and follow owner/admin visibility rules:
  - Normal image on an active report, stored under the report owner's folder: any authenticated campus member.
  - Normal image path that does not match the attached report owner's folder: owner or administrator only.
  - Sensitive image (`{userId}/sensitive/...`): owner or administrator only while active.
  - Images attached to a resolved report: administrator only. Students (including the original reporter) cannot access images of resolved reports.
  - Unattached image: owner or administrator only.
- Restrictive policies prevent stale permissive policies from re-opening resolved reports or sensitive images.
- Unnecessary anonymous EXECUTE privileges on SECURITY DEFINER functions are revoked.
- Administrators get read access to persisted match records.
- The `report-images` bucket and its full write policy set are declared idempotently.
- New signups must use a `@sguk.ac.in` college email address matching numeric PRN format (e.g. `242631003@sguk.ac.in`) unless they are provisioned with trusted `app_metadata.role = "admin"`.

### Migration 2: Campus Recovery & Helpdesk Handover Architecture (`20261113160000`)
- **Campus Memberships (`campus_memberships`)**: Server-controlled membership states (`PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED`) for `student`, `staff`, `desk_operator`, and `admin`. Revocation takes immediate effect at database RLS without trusting stale client JWTs.
- **Staff Allowlist (`staff_allowlist`)**: Pre-approved faculty and staff accounts managed by administrators. Allows approved non-PRN staff emails to register.
- **Configurable Campus Desks (`campus_desks`)**: Official recovery locations. Default Central Campus Helpdesk is flagged `is_configured = false` to indicate institutional setup remains necessary.
- **Structured Report Attributes**: Brand/model, color, distinguishing features, SGUK campus zone, and custody status (`with_finder`, `handed_to_desk`, `only_observed`).
- **Private Identifying Details (`report_private_details`)**: Cleanly replaces the confusing PIN system for new reports. Stores private clues visible only to the reporter and authorized administrators/desk operators.
- **Claims Lifecycle & Recovery State Machine (`claims`)**: Formal claim statuses (`REQUESTED`, `UNDER_REVIEW`, `APPROVED_FOR_HANDOVER`, `HANDED_OVER`, `RESOLVED`, `REJECTED`, `WITHDRAWN`, `DISPUTED`).
- **Helpdesk Handover Records (`handover_records`)**: Audited physical handovers with verified claimant identity, operator signature, and condition notes.
- **Abuse Protection & Rate Limiting (`rate_limit_events`)**: PostgreSQL-enforced quotas (3 reports/hour, 10 reports/day, 20 edits/day, 5 claims/day, 10 abuse reports/day).
- **Administrative Audit Logs (`audit_logs`) & Abuse Reports (`moderation_reports`)**: Complete traceability for all sensitive actions and suspicious content reporting.
- **Initial Administrator Provisioning Protection**: Protects `vachannoubade@gmail.com` from unauthorized registration via public signup endpoints.

No existing reports, profiles, matches, or images are deleted.

### Administrator identity

The only trusted administrator source is:

```text
auth.users.raw_app_meta_data -> 'role' = 'admin'
```

Do **not** use `user_metadata`, local storage, URL parameters, or an editable `profiles` column to grant administrator access. Supabase users can update their own `user_metadata`, but they cannot update `raw_app_meta_data` through the public client. Dedicated administrative login is available at `/admin/login`.

---

## 2. Administrator Provisioning & Lifecycle Architecture

The sole authorized initial administrator email is:
`vachannoubade@gmail.com`

This account is an authorized exception to the `@sguk.ac.in` PRN email requirement, but **cannot** be registered through public signup.

### Initial Provisioning Procedure:
The project provides a dedicated, transaction-safe, idempotent SQL script at:
`supabase/provision_admin.sql`

1. In the Supabase Dashboard, go to **Authentication > Users** and verify `vachannoubade@gmail.com` exists.
   - If the account does not exist, invite the user via **Authentication > Users > Invite user** with email `vachannoubade@gmail.com`.
2. Open the **SQL Editor** in the Supabase Dashboard.
3. Paste and execute the contents of `supabase/provision_admin.sql`.
   - The script confirms the administrator's email.
   - Upgrades `raw_app_meta_data` to `{"role": "admin", "admin_provisioned_at": "..."}`.
   - Upserts an `ACTIVE` `campus_memberships` record with `membership_type = 'admin'`.
   - Records an immutable audit log in `public.audit_logs`.
   - Guarantees transaction safety and fails cleanly if the identity is missing or ambiguous.

### Supabase Auth URL Configuration:
In the Supabase Dashboard under **Authentication > URL Configuration**:
- **Site URL**: `https://your-production-app.vercel.app` (or `http://localhost:5173` for development).
- **Redirect URLs**: Add the following allowlisted paths:
  - `https://your-production-app.vercel.app/auth?mode=update-password&redirectTo=/admin`
  - `https://your-production-app.vercel.app/auth*`
  - `http://localhost:5173/auth?mode=update-password&redirectTo=/admin`
  - `http://localhost:5173/auth*`

### Administrator Password Setup & Recovery Lifecycle:
1. **Password Setup / Reset Request**:
   - The administrator visits `/admin/login` and clicks "Request password setup / reset".
   - The system calls `supabase.auth.resetPasswordForEmail` directing to `/auth?mode=update-password&redirectTo=/admin`.
   - Generic confirmation messaging is displayed to prevent account enumeration.
2. **Secure Password Entry**:
   - The administrator clicks the link in their email, which establishes an authenticated recovery session.
   - The page `/auth?mode=update-password&redirectTo=/admin` validates the recovery token and enforces an 8+ character password.
   - If accessed without an active recovery token, an "Invalid or Expired Link" warning is shown with a link back to `/admin/login`.
3. **Server-Side Authorization Gating**:
   - After updating the password, the client calls `can_access_admin_portal()` via RPC.
   - Only when the database confirms the user has `raw_app_meta_data.role = 'admin'` AND an active, unexpired `campus_memberships` record is the administrator redirected into `/admin`.
4. **Session Termination & Cache Eviction**:
   - On signing out of the Admin Portal or Layout, `signOut()` is called, signed image URL caches are cleared via `clearSignedUrlCache()`, and the user is redirected to `/admin/login`.
5. **MFA Recommendation**:
   - Multi-Factor Authentication (TOTP) should be enabled by the administrator within Supabase Auth settings upon initial sign-in.

---

## 3. Prerequisites

- Staging Supabase project with the existing LostLink migrations.
- Supabase CLI for the preferred deployment path.
- Database backup access.
- Two student test accounts and one administrator test account.
- Migration file checksum recorded.
- No service-role key in any `VITE_` variable or browser bundle.

Recommended role separation:

| Task | Role |
| :--- | :--- |
| Apply migrations | Supabase CLI migration role |
| Provision administrator | Trusted server-side/service-role operator |
| Student verification | Student A and Student B browser sessions |
| Admin verification | Administrator browser session |

---

## 4. Preflight

1. Confirm the staging project, not live.
2. Confirm current migration state:

   ```bash
   supabase link --project-ref "$STAGING_PROJECT_REF"
   supabase migration list
   ```

3. Confirm `20261012163500` and `20261015113000` are applied.
4. Review `20261113120000_stage_ready_access_hardening.sql` and `20261113160000_campus_recovery_handover_architecture.sql`, recording their checksums.
5. Capture the current policy snapshot before applying:

   ```sql
   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
   FROM pg_policies
   WHERE schemaname IN ('public', 'storage')
   ORDER BY schemaname, tablename, policyname;
   ```

6. Capture function and trigger state:

   ```sql
   SELECT proname
   FROM pg_proc
   WHERE pronamespace IN ('public'::regnamespace, 'storage'::regnamespace)
     AND proname IN (
       'is_current_user_admin',
       'can_access_report_image',
       'enforce_college_email_domain'
     );

   SELECT tgname, tgenabled
   FROM pg_trigger
   WHERE tgname = 'enforce_college_email_domain'
     AND NOT tgisinternal;
   ```

7. Back up the staging database.

### Provider backup

Take a dashboard/PITR backup or snapshot and record its identifier. This is the preferred rollback artifact.

### Logical backup

Use a secret-managed connection string, never a value pasted into source or a browser:

```bash
pg_dump "$STAGING_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --schema=public \
  --schema=storage \
  --file="lostlink-staging-pre-hardening.dump"
```

If a full logical backup including `auth` is required, encrypt it and delete it after the deployment window. Authentication exports contain sensitive account data.

8. Verify the backup can be listed:

   ```bash
   pg_restore --list "lostlink-staging-pre-hardening.dump"
   ```

---

## 5. Apply on staging

Preferred path:

```bash
supabase migration list
supabase db push --dry-run
supabase db push
```

If `--dry-run` is unavailable in the installed CLI, review `supabase migration list` and the exact SQL file, then run `supabase db push`.

If the project is managed manually through the SQL editor, open a single reviewed transaction, paste the exact migration contents, and execute it as the migration owner. Do not split the file into unrelated ad-hoc changes.

Expected result: the migration completes without deleting rows or rewriting report data.

### Staging administrator provisioning

Run this **only** from a trusted server-side context with service-role/database-owner access. Replace the placeholder email locally at execution time. Do not commit a real administrator email into a migration or the repository.

```sql
UPDATE auth.users
SET raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
WHERE email = '<administrator-college-email>';
```

The administrator must sign out and sign back in so the access token contains the new `app_metadata` claim. A browser refresh alone may not replace an already-issued JWT.

To remove administrator access:

```sql
UPDATE auth.users
SET raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) - 'role'
WHERE email = '<administrator-college-email>';
```

The account must sign out and sign in again. Existing sessions can remain valid until their token is refreshed.

### Existing account deactivation and reactivation

To deactivate a student or staff account immediately:

```sql
-- Standard Supabase Auth ban (rejects authentication and invalidates active JWT tokens)
UPDATE auth.users
SET banned_until = 'infinity'
WHERE email = '<user-email>';
```

To reactivate a previously deactivated account:

```sql
UPDATE auth.users
SET banned_until = NULL
WHERE email = '<user-email>';
```

If an account is permanently removed from `auth.users`, all linked profile rows, reports, verifications, and notifications cascade automatically (`ON DELETE CASCADE`), ensuring clean state without orphaned records. Institutional enrollment verification APIs are not required.

---

## 6. Staging verification

### 5.1 Schema verification

```sql
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'report-images';

SELECT schemaname, tablename, policyname, permissive, cmd, roles
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'is_current_user_admin',
    'can_access_report_image',
    'enforce_college_email_domain'
  );

SELECT tgname
FROM pg_trigger
WHERE tgname = 'enforce_college_email_domain'
  AND NOT tgisinternal;
```

Expected:

- `report-images` is private with a 5 MB limit and JPEG/PNG/WebP MIME types.
- `"Resolved reports require administrator access"` is `RESTRICTIVE`.
- `"Report image visibility is restricted"` is `RESTRICTIVE`.
- The storage owner-folder write guards are present and restrictive.
- `"Reports are readable by authenticated users"` (the old blanket policy) is absent.
- The three functions and the signup trigger exist.

### 5.2 RLS impersonation checks

The SQL editor runs as a privileged role, so impersonate a real test account by setting JWT claims and switching roles. Always roll back.

Student claim:

```sql
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '<student-uuid>',
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'student')
  )::text,
  true
);
SET LOCAL ROLE authenticated;

SELECT public.is_current_user_admin();                 -- false
SELECT count(*) FROM public.reports;                  -- active records only
SELECT count(*) FROM public.reports WHERE status = 'resolved'; -- 0

ROLLBACK;
```

Administrator claim:

```sql
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '<administrator-uuid>',
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'admin')
  )::text,
  true
);
SET LOCAL ROLE authenticated;

SELECT public.is_current_user_admin();                 -- true
SELECT count(*) FROM public.reports;                  -- active + resolved
SELECT count(*) FROM public.matches;                  -- all persisted matches

ROLLBACK;
```

Do not use fake `user_metadata.role` claims. Only `app_metadata.role` is trusted.

### 5.3 Two-student + administrator UI checks

Create or reuse three staging accounts:

- Student A: `@sguk.ac.in`
- Student B: `@sguk.ac.in`
- Administrator: trusted app metadata `role = "admin"` after provisioning, then signed out/in

Run these checks in separate browser profiles or incognito sessions.

| Check | Student A | Student B | Administrator |
| :--- | :--- | :--- | :--- |
| Nav shows Admin Portal | No | No | Yes |
| Direct `/admin` URL | Access denied | Access denied | Loads portal |
| Active reports visible | Yes | Yes | Yes |
| Resolved reports visible | No | No | Yes |
| Resolved archive tab | N/A | N/A | Shows records |
| Normal active report image | Yes | Yes | Yes |
| Other student's sensitive image | No | No | Yes |
| Own sensitive image | Yes | Yes | Yes |
| Resolved report image (any student) | No | No | Yes |
| Sensitive image after resolution (any student) | No | No | Yes |
| Search, tabs, detail drawer | N/A | N/A | Works |
| Mutating controls in portal | N/A | N/A | None |

Also verify direct REST access, not only the UI:

- Student request for `reports?status=eq.resolved` returns no rows.
- Student `createSignedUrl` for another student's sensitive path fails.
- Student request for `matches` returns only matches involving the student's reports.
- Student `is_current_user_admin` RPC returns `false`.
- Student cannot update `auth.users.raw_app_meta_data` (denied by privileges).
- Administrator signed URLs work for resolved and sensitive images.
- Administrator match query returns all persisted match rows.

### 5.4 Signup-domain checks

- Attempt to create an account with a non-college email through the public signup form: rejected by client and database.
- Attempt the same through the Auth API with the anon key: rejected by the database trigger.
- Create a college account with mixed-case/whitespace email: stored normalized, with `raw_user_meta_data.prn` set.
- Confirm a pre-existing legacy account can still sign in. The trigger is `BEFORE INSERT` only and does not rewrite existing accounts.
- Confirm an administrator-provisioned account outside the college domain is allowed only because it carries trusted `app_metadata.role = "admin"`.

### 5.5 Match semantics check

LostLink currently does not persist every generated match on the server. The admin portal displays a merged view:

- persisted rows from `public.matches`, plus
- live candidates generated from active reports.

The portal labels this as `LIVE + PERSISTED`. Confirm that the Matched tab and candidate list match actual report pairs, and that no mutation controls are present.

---

## 7. Rollback & Forward-Repair Strategy

### Recommended: Non-Destructive Forward-Repair
In a production deployment, **never perform a destructive rollback that drops recovery tables** once students have filed claims, physical handovers have occurred, or audit logs have accumulated. Dropping tables permanently destroys custody records, legal evidence of property return, and audit trails.

If a bug or schema discrepancy occurs in production:
1. Apply a non-destructive forward migration that repairs the trigger, policy, or RPC.
2. If necessary, suspend active signups or put desks in maintenance mode using `UPDATE public.campus_desks SET is_active = false;`.
3. Preserve all historical claims, handovers, and audit logs.

### Emergency Rollback (Staging / Pre-Production Only)
Emergency SQL rollback should be performed in reverse chronological order:

#### Step 1: Rollback Campus Recovery Architecture (`20261113160000`)
```bash
# Safety Guard: If production data exists, the rollback script will automatically abort
# To authorize intentional destructive rollback in testing:
# SET lostlink.allow_destructive_rollback = 'true';

psql "$STAGING_DATABASE_URL" \
  --file="supabase/rollback/20261113160000_campus_recovery_handover_architecture_rollback.sql"
```

#### Step 2: Rollback Access Hardening (`20261113120000`) (if required)
```bash
psql "$STAGING_DATABASE_URL" \
  --file="supabase/rollback/20261113120000_stage_ready_access_hardening_rollback.sql"
```

### Irreversible Rollback Limitations:
- Running destructive table drops after live operations will result in permanent loss of:
  - All verified student ownership claims (`claims`).
  - Physical helpdesk custody verification and handover receipts (`handover_records`).
  - Security audit events and rate-limit logs (`audit_logs`, `rate_limit_events`).
  - Pre-approved faculty and staff credentials (`staff_allowlist`).
- Therefore, destructive rollback is barred unless explicitly forced via session setting, and forward repair is the mandatory operational standard in production.

---

## 8. Live deployment gate

Apply to live only when all of the following are true:

- Staging schema, RLS impersonation, UI, signup, and storage checks pass.
- Two-student + administrator checks pass with separate sessions.
- The backup is verified and its identifier recorded.
- The exact migration checksums match the tested files.
- Rollback owner and deployment window are agreed.
- Administrator provisioning (`vachannoubade@gmail.com`) has been tested with sign-out/sign-in and JWT refresh.
- Campus desk configuration is verified (`is_configured = false` initial pending banner is understood by campus operators).
- No service-role or secret key is present in client-visible configuration.

After live deployment:

1. Re-run the schema and RLS impersonation checks.
2. Re-run the two-student + administrator checks with live test accounts.
3. Monitor Auth and PostgREST logs for RLS errors, signup failures, and storage 403s.
4. Remove live test accounts and test reports.
5. Record the deployment result.

If a live verification fails, stop, preserve logs, and roll back using the approved rollback path. Do not iteratively patch live without a reviewed migration.

---

## 9. Local reproducibility

These checks run in this workspace and do not touch staging or live:

```bash
npm test
npm run test:db
npm run lint
npm run build
```

- `npm test`: Runs **47 unit tests** across matching heuristics, verification logic, Supabase URL protection, college PRN email regex, admin access guards (including open-redirect sanitization and authorized initial admin identity), and claim input validation.
- `npm run test:db`: Runs **18 database tests** against `@electric-sql/pglite` validating both `20261113120000_stage_ready_access_hardening.sql` and `20261113160000_campus_recovery_handover_architecture.sql`:
  - Resolved report invisibility to students and visibility to admins.
  - Sensitive and archived image access control.
  - Storage path-traversal rejection.
  - Match record RLS.
  - Trusted `app_metadata` admin claim restriction.
  - College PRN email enforcement and legacy account preservation.
  - Staff allowlist pre-approval.
  - Server-side rate limiting and input length constraints.
  - Complete claims lifecycle, competing claim dispute handling, and helpdesk handover.
  - Universal membership revocation (suspended/revoked accounts immediately blocked across reports, claims, and storage).
  - Authoritative `can_access_admin_portal()` server-side authorization check.
  - Safe, idempotent initial admin provisioning script (`supabase/provision_admin.sql`).
  - Production data safety guards and clean transaction rollback for both migrations.
- `npm run lint`: 0 errors.
- `npm run build`: Production TypeScript compilation and Vite bundling with zero leaks.

Limitations of the local harness:

- PGlite does not provide the Supabase storage API or `pgcrypto`; the fixture does not replay the entire historical migration chain.
- It is not a substitute for staging checks on live Supabase services.
- It cannot validate the live Auth service, JWT issuance, or Storage signed-URL service.

The workspace currently has no local/staging database credentials, so live database verification has not been performed here.
