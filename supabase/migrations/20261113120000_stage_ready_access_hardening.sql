-- =============================================================================
-- LostLink — Stage-Ready Access Hardening
-- Migration Timestamp: 20261113120000
-- =============================================================================
-- Apply in order after 20261015113000_ownership_verification.sql.
--
-- This migration:
--   1. Defines the single trusted definition of an administrator.
--   2. Keeps resolved reports out of the student-facing API entirely.
--   3. Makes report-image visibility owner-aware and sensitive-image aware.
--   4. Re-declares the complete storage policy set so it is self-contained.
--   5. Grants administrators read access to match records.
--   6. Enforces the college email domain for new accounts at the database edge.
--
-- It does not delete reports, images, profiles, or matches.

-- -----------------------------------------------------------------------------
-- 1. Trusted administrator helper
-- -----------------------------------------------------------------------------
-- The only source of administrative identity is server-controlled app_metadata.
-- Students can update user_metadata, but not app_metadata, so this claim cannot
-- be self-assigned from the browser or the public API.
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Restrict resolved reports to administrators only
-- -----------------------------------------------------------------------------
-- Active reports remain readable by authenticated campus members. Resolved
-- records stay in the database but are not exposed to student clients.
--
-- The permissive policy supports normal queries. The restrictive policy also
-- ANDs with any permissive policy that may already exist, so a stale or
-- forgotten "USING (true)" policy cannot reintroduce student access.
DROP POLICY IF EXISTS "Reports are readable by authenticated users" ON public.reports;
DROP POLICY IF EXISTS "Active reports are readable by authenticated users" ON public.reports;
DROP POLICY IF EXISTS "Resolved reports require administrator access" ON public.reports;

CREATE POLICY "Active reports are readable by authenticated users"
  ON public.reports
  FOR SELECT
  TO authenticated
  USING (
    status <> 'resolved'
    OR public.is_current_user_admin()
  );

CREATE POLICY "Resolved reports require administrator access"
  ON public.reports
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    status <> 'resolved'
    OR public.is_current_user_admin()
  );

-- The storage visibility helper looks up report status by image path.
CREATE INDEX IF NOT EXISTS idx_reports_image_url
  ON public.reports (image_url)
  WHERE image_url IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Report-image visibility helper
-- -----------------------------------------------------------------------------
-- Path formats:
--   {userId}/{filename}             normal image
--   {userId}/sensitive/{filename}   sensitive image
--
-- Rules:
--   * Sensitive images: owner or administrator only, regardless of report status.
--   * Normal images attached to a resolved report: owner or administrator only.
--   * Normal images attached to an active report owned by the path folder owner:
--     any authenticated campus member. A path/report owner mismatch remains
--     owner/admin-only.
--   * Unattached normal images: owner or administrator only.
--
-- SECURITY DEFINER is required because storage policies evaluate this function
-- for roles that have no direct SELECT grant on public.reports.
CREATE OR REPLACE FUNCTION public.can_access_report_image(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_folder text[];
  v_is_admin boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Reject malformed keys and path traversal before any policy decision.
  IF object_name IS NULL
     OR object_name = ''
     OR object_name LIKE '/%'
     OR object_name ~ '(^|/)\.\.(/|$)' THEN
    RETURN false;
  END IF;

  v_is_admin := public.is_current_user_admin();
  v_folder := storage.foldername(object_name);

  -- 1. Attached to a resolved report: administrator only. Students (including the owner)
  -- must never access images of resolved reports.
  IF EXISTS (
    SELECT 1
    FROM public.reports r
    WHERE r.image_url = object_name
      AND r.status = 'resolved'
  ) THEN
    RETURN v_is_admin;
  END IF;

  -- 2. Sensitive images: owner or administrator only, regardless of report status.
  IF coalesce(v_folder[2], '') = 'sensitive' THEN
    RETURN v_is_admin OR coalesce(v_folder[1], '') = v_uid::text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reports r
    WHERE r.image_url = object_name
      AND r.status <> 'resolved'
      AND r.user_id::text = coalesce(v_folder[1], '')
  ) THEN
    RETURN true;
  END IF;

  -- An object with no report yet is visible only to its uploader or an admin.
  RETURN v_is_admin OR coalesce(v_folder[1], '') = v_uid::text;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_report_image(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_report_image(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Private report-images bucket and complete storage policy set
-- -----------------------------------------------------------------------------
-- Declaring the bucket and every policy here ensures that historical policies
-- are safely superseded and that this migration is self-contained no matter
-- which storage policies exist in the target project.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-images',
  'report-images',
  false,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Authenticated students can view report images" ON storage.objects;
DROP POLICY IF EXISTS "Campus members can view normal and own sensitive report images" ON storage.objects;
DROP POLICY IF EXISTS "Campus members can view report images" ON storage.objects;
DROP POLICY IF EXISTS "Report image visibility is restricted" ON storage.objects;
DROP POLICY IF EXISTS "Students can upload images to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Students can update own images" ON storage.objects;
DROP POLICY IF EXISTS "Students can delete own images" ON storage.objects;
DROP POLICY IF EXISTS "Owners can upload report images" ON storage.objects;
DROP POLICY IF EXISTS "Owners can update report images" ON storage.objects;
DROP POLICY IF EXISTS "Owners can delete report images" ON storage.objects;
DROP POLICY IF EXISTS "Report image inserts require owner folder" ON storage.objects;
DROP POLICY IF EXISTS "Report image updates require owner folder" ON storage.objects;
DROP POLICY IF EXISTS "Report image deletes require owner folder" ON storage.objects;

-- Permissive SELECT: the actual visibility decision is made by the helper.
CREATE POLICY "Campus members can view report images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'report-images');

-- Restrictive SELECT: ANDs with any other permissive SELECT policy, including
-- stale policies that might still allow blanket access to the bucket.
CREATE POLICY "Report image visibility is restricted"
  ON storage.objects
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    bucket_id <> 'report-images'
    OR public.can_access_report_image(name)
  );

-- Permissive writes: owner folder only, with explicit traversal rejection.
CREATE POLICY "Owners can upload report images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'report-images'
    AND coalesce((storage.foldername(name))[1], '') = auth.uid()::text
    AND name !~ '(^|/)\.\.(/|$)'
    AND name !~ '^/'
  );

CREATE POLICY "Owners can update report images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'report-images'
    AND coalesce((storage.foldername(name))[1], '') = auth.uid()::text
    AND name !~ '(^|/)\.\.(/|$)'
    AND name !~ '^/'
  )
  WITH CHECK (
    bucket_id = 'report-images'
    AND coalesce((storage.foldername(name))[1], '') = auth.uid()::text
    AND name !~ '(^|/)\.\.(/|$)'
    AND name !~ '^/'
  );

CREATE POLICY "Owners can delete report images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'report-images'
    AND coalesce((storage.foldername(name))[1], '') = auth.uid()::text
    AND name !~ '(^|/)\.\.(/|$)'
    AND name !~ '^/'
  );

-- Restrictive write guards: a stale permissive write policy cannot bypass the
-- owner-folder requirement.
CREATE POLICY "Report image inserts require owner folder"
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id <> 'report-images'
    OR (
      coalesce((storage.foldername(name))[1], '') = auth.uid()::text
      AND name !~ '(^|/)\.\.(/|$)'
      AND name !~ '^/'
    )
  );

CREATE POLICY "Report image updates require owner folder"
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id <> 'report-images'
    OR (
      coalesce((storage.foldername(name))[1], '') = auth.uid()::text
      AND name !~ '(^|/)\.\.(/|$)'
      AND name !~ '^/'
    )
  )
  WITH CHECK (
    bucket_id <> 'report-images'
    OR (
      coalesce((storage.foldername(name))[1], '') = auth.uid()::text
      AND name !~ '(^|/)\.\.(/|$)'
      AND name !~ '^/'
    )
  );

CREATE POLICY "Report image deletes require owner folder"
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    bucket_id <> 'report-images'
    OR (
      coalesce((storage.foldername(name))[1], '') = auth.uid()::text
      AND name !~ '(^|/)\.\.(/|$)'
      AND name !~ '^/'
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Administrator read access to match records
-- -----------------------------------------------------------------------------
-- Student match visibility remains limited by the historical policy. This
-- additional permissive policy lets administrators inspect persisted matches.
DROP POLICY IF EXISTS "Administrators can view all matches" ON public.matches;

CREATE POLICY "Administrators can view all matches"
  ON public.matches
  FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

-- -----------------------------------------------------------------------------
-- 6. Server-side college email domain enforcement
-- -----------------------------------------------------------------------------
-- Client validation is only a UX aid. This trigger rejects non-college email
-- signups even if a client bypasses the form. It is BEFORE INSERT only, so
-- existing accounts are not touched or forced out of the application.
CREATE OR REPLACE FUNCTION public.enforce_college_email_domain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  normalized_email text;
  prn text;
BEGIN
  normalized_email := lower(btrim(coalesce(NEW.email, '')));

  -- Trusted administrative provisioning may create non-student accounts.
  IF NEW.raw_app_meta_data IS NOT NULL
     AND NEW.raw_app_meta_data ->> 'role' = 'admin' THEN
    NEW.email := normalized_email;
    RETURN NEW;
  END IF;

  IF normalized_email !~ '^[0-9]{6,16}@sguk\.ac\.in$' THEN
    RAISE EXCEPTION 'Only college email addresses in the format yourPRNnumber@sguk.ac.in can create an account';
  END IF;

  IF NEW.raw_user_meta_data IS NULL
     OR jsonb_typeof(NEW.raw_user_meta_data) <> 'object' THEN
    NEW.raw_user_meta_data := '{}'::jsonb;
  END IF;

  prn := split_part(normalized_email, '@', 1);
  NEW.email := normalized_email;
  NEW.raw_user_meta_data :=
    coalesce(NEW.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('prn', prn);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_college_email_domain ON auth.users;

CREATE TRIGGER enforce_college_email_domain
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_college_email_domain();

REVOKE EXECUTE ON FUNCTION public.enforce_college_email_domain() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 7. Restrict unnecessary anonymous execution of SECURITY DEFINER functions
-- -----------------------------------------------------------------------------
-- Prevent unauthenticated invocation of internal functions and RPCs while
-- preserving legitimate authenticated workflows and database triggers.
DO $$
BEGIN
  -- Internal triggers: no direct client execution
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_report_update' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.handle_report_update() FROM PUBLIC';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_report_resolved' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.handle_report_resolved() FROM PUBLIC';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_college_email_domain' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.enforce_college_email_domain() FROM PUBLIC';
  END IF;

  -- Profile and resolution procedures: authenticated only
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ensure_profile_exists' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.ensure_profile_exists() FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.ensure_profile_exists() TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resolve_report' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.resolve_report(uuid) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.resolve_report(uuid) TO authenticated';
  END IF;

  -- Ownership verification procedures: authenticated only
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_report_verification_details' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.set_report_verification_details(uuid, text, text) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.set_report_verification_details(uuid, text, text) TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_owner_verification_details' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_owner_verification_details(uuid) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_owner_verification_details(uuid) TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'verify_ownership' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.verify_ownership(uuid, text, text) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.verify_ownership(uuid, text, text) TO authenticated';
  END IF;

  -- Admin helper & storage function: authenticated only
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_current_user_admin' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_access_report_image' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.can_access_report_image(text) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.can_access_report_image(text) TO authenticated';
  END IF;
END $$;
