-- =============================================================================
-- LostLink — Rollback for 20261113120000_stage_ready_access_hardening
-- =============================================================================
-- EMERGENCY USE ONLY.
--
-- This restores the pre-hardening policy behavior: all authenticated students
-- can read resolved reports and all report images. That is intentionally less
-- secure. Prefer restoring the pre-migration database backup, or roll back and
-- immediately re-apply a corrected forward migration.
--
-- This script does not delete reports, profiles, images, or matches.

-- -----------------------------------------------------------------------------
-- 1. Remove administrator-dependent policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Active reports are readable by authenticated users" ON public.reports;
DROP POLICY IF EXISTS "Resolved reports require administrator access" ON public.reports;
DROP POLICY IF EXISTS "Administrators can view all matches" ON public.matches;

-- -----------------------------------------------------------------------------
-- 2. Restore the historical report read policy
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Reports are readable by authenticated users" ON public.reports;

CREATE POLICY "Reports are readable by authenticated users"
  ON public.reports
  FOR SELECT
  TO authenticated
  USING (true);

-- -----------------------------------------------------------------------------
-- 3. Remove hardened storage policies and restore the historical set
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Campus members can view normal and own sensitive report images" ON storage.objects;
DROP POLICY IF EXISTS "Campus members can view report images" ON storage.objects;
DROP POLICY IF EXISTS "Report image visibility is restricted" ON storage.objects;
DROP POLICY IF EXISTS "Owners can upload report images" ON storage.objects;
DROP POLICY IF EXISTS "Owners can update report images" ON storage.objects;
DROP POLICY IF EXISTS "Owners can delete report images" ON storage.objects;
DROP POLICY IF EXISTS "Report image inserts require owner folder" ON storage.objects;
DROP POLICY IF EXISTS "Report image updates require owner folder" ON storage.objects;
DROP POLICY IF EXISTS "Report image deletes require owner folder" ON storage.objects;

CREATE POLICY "Authenticated students can view report images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'report-images');

CREATE POLICY "Students can upload images to own folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'report-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Students can update own images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'report-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'report-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Students can delete own images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'report-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- 4. Remove helper functions, indexes, and signup enforcement
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.can_access_report_image(text);
DROP FUNCTION IF EXISTS public.is_current_user_admin();
DROP INDEX IF EXISTS public.idx_reports_image_url;

DROP TRIGGER IF EXISTS enforce_college_email_domain ON auth.users;
DROP FUNCTION IF EXISTS public.enforce_college_email_domain();
