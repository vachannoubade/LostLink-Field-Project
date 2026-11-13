# LostLink Stage-Ready Deployment & Verification

This runbook covers `supabase/migrations/20261113120000_stage_ready_access_hardening.sql`. It is written for a staging project first, with a separate live-deployment gate.

> **Do not apply this migration to the live project until the staging checks below pass and the change is explicitly approved.**

---

## 1. What the migration changes

- Resolved reports are readable only by administrators.
- Report images are private and follow these visibility rules:
  - Normal image on an active report, stored under the report owner's folder: any authenticated campus member.
  - Normal image path that does not match the attached report owner's folder: owner or administrator only.
  - Sensitive image (`{userId}/sensitive/...`): owner or administrator only.
  - Normal image on a resolved report: owner or administrator only.
  - Unattached image: owner or administrator only.
- Restrictive policies prevent stale permissive policies from re-opening resolved reports or sensitive images.
- Administrators get read access to persisted match records.
- The `report-images` bucket and its full write policy set are declared in this migration, so it does not depend on the historical storage migration file.
- New signups must use a `@sguk.ac.in` college email address unless they are provisioned with trusted `app_metadata.role = "admin"`.

No reports, profiles, matches, or images are deleted.

### Historical storage migration note

The historical storage migration `supabase/migrations/20261014111500_report_images_storage.sql` is preserved. This new hardening migration (`20261113120000_stage_ready_access_hardening.sql`) explicitly drops the historical permissive policies and replaces them with hardened owner-scoped and restrictive visibility policies. It is idempotent and self-contained for the bucket and storage policies.

### Administrator identity

The only trusted administrator source is:

```text
auth.users.raw_app_meta_data -> 'role' = 'admin'
```

Do **not** use `user_metadata`, local storage, URL parameters, or an editable `profiles` column to grant administrator access. Supabase users can update their own `user_metadata`, but they cannot update `raw_app_meta_data` through the public client.

---

## 2. Prerequisites

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

## 3. Preflight

1. Confirm the staging project, not live.
2. Confirm current migration state:

   ```bash
   supabase link --project-ref "$STAGING_PROJECT_REF"
   supabase migration list
   ```

3. Confirm `20261012163500` and `20261015113000` are applied.
4. Review `20261113120000_stage_ready_access_hardening.sql` and record its checksum.
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

## 4. Apply on staging

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

---

## 5. Staging verification

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
| Resolved report image (non-owner) | No | No | Yes |
| Sensitive image after resolution | Owner only | Owner only | Yes |
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

## 6. Rollback

Preferred rollback: restore the pre-migration backup or PITR snapshot.

Emergency SQL rollback:

```bash
psql "$STAGING_DATABASE_URL" \
  --file="supabase/rollback/20261113120000_stage_ready_access_hardening_rollback.sql"
```

The rollback script:

- removes the new restrictive and administrator policies,
- restores the historical blanket report/storage read policies,
- removes the helper functions and image index,
- removes the signup email trigger.

It does not delete reports, images, profiles, or matches, and it does not remove the bucket. It intentionally restores the less-secure pre-hardening behavior. After a rollback, fix the forward migration and re-apply it, or restore the backup. Do not leave staging in the rolled-back state.

---

## 7. Live deployment gate

Apply to live only when all of the following are true:

- Staging schema, RLS impersonation, UI, signup, and storage checks pass.
- Two-student + administrator checks pass with separate sessions.
- The backup is verified and its identifier recorded.
- The exact migration checksum matches the tested file.
- Rollback owner and deployment window are agreed.
- Administrator provisioning has been tested with sign-out/sign-in and JWT refresh.
- No service-role or secret key is present in client-visible configuration.

After live deployment:

1. Re-run the schema and RLS impersonation checks.
2. Re-run the two-student + administrator checks with live test accounts.
3. Monitor Auth and PostgREST logs for RLS errors, signup failures, and storage 403s.
4. Remove live test accounts and test reports.
5. Record the deployment result.

If a live verification fails, stop, preserve logs, and roll back using the approved rollback path. Do not iteratively patch live without a reviewed migration.

---

## 8. Local reproducibility

These checks run in this workspace and do not touch staging or live:

```bash
npm test
npm run test:db
npm run lint
npm run build
```

`npm run test:db` uses `@electric-sql/pglite` with a minimal Supabase-compatible fixture. It applies the exact hardening migration twice, then verifies:

- resolved report visibility for students vs administrators,
- sensitive, resolved, orphan, and active image visibility,
- owner-only storage writes and path-traversal rejection,
- restrictive-policy defense against stale permissive policies,
- match visibility,
- trusted `app_metadata`-only administrator claims,
- signup-domain enforcement and preservation of legacy accounts.

Limitations of the local harness:

- PGlite does not provide the Supabase storage API or `pgcrypto`; the fixture does not replay the entire historical migration chain.
- It is not a substitute for the staging checks above.
- It cannot validate the live Auth service, JWT issuance, or Storage signed-URL service.

The workspace currently has no local/staging database credentials, so live database verification has not been performed here.
