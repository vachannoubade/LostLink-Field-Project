-- =============================================================================
-- LostLink — Rollback for 20261113160000_campus_recovery_handover_architecture
-- =============================================================================
-- CRITICAL PRODUCTION DATA SAFETY GUARD:
-- This rollback script checks whether accumulated production claims, physical
-- handover records, or audit histories exist. If live recovery data is detected,
-- it will ABORT immediately rather than silently dropping recovery records.
--
-- To override in a controlled test/staging environment:
--   SET lostlink.allow_destructive_rollback = 'true';
--
-- SAFE FORWARD-REPAIR STRATEGY:
-- If live production issues occur, prefer applying a forward repair migration rather
-- than dropping tables. Dropping tables permanently deletes verified student claims
-- and physical custody handover audits.

DO $$
DECLARE
  v_handover_count INT := 0;
  v_claim_count INT := 0;
  v_audit_count INT := 0;
  v_allow_destructive TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'handover_records') THEN
    SELECT count(*) INTO v_handover_count FROM public.handover_records;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'claims') THEN
    SELECT count(*) INTO v_claim_count FROM public.claims;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    SELECT count(*) INTO v_audit_count FROM public.audit_logs;
  END IF;

  v_allow_destructive := coalesce(current_setting('lostlink.allow_destructive_rollback', true), 'false');

  IF (v_handover_count > 0 OR v_claim_count > 0 OR v_audit_count > 0) AND v_allow_destructive <> 'true' THEN
    RAISE EXCEPTION 'SAFETY ABORT: Production data detected (% handovers, % claims, % audit logs). Rollback will not silently delete recovery history. Set lostlink.allow_destructive_rollback = ''true'' to force or deploy a non-destructive forward repair.',
      v_handover_count, v_claim_count, v_audit_count;
  END IF;
END $$;

-- 1. Drop triggers
DROP TRIGGER IF EXISTS on_user_membership_sync ON auth.users;
DROP FUNCTION IF EXISTS public.handle_user_membership_sync();

DROP TRIGGER IF EXISTS trg_enforce_report_mutation_rules ON public.reports;
DROP FUNCTION IF EXISTS public.trg_enforce_report_mutation_rules();

DROP TRIGGER IF EXISTS trg_enforce_moderation_report_rules ON public.moderation_reports;
DROP FUNCTION IF EXISTS public.trg_enforce_moderation_report_rules();

DROP TRIGGER IF EXISTS trg_enforce_claim_state_rules ON public.claims;
DROP FUNCTION IF EXISTS public.trg_enforce_claim_state_rules();

-- 2. Drop added restrictive policies on reports
DROP POLICY IF EXISTS "Active membership required for report reads" ON public.reports;
DROP POLICY IF EXISTS "Active membership required for report writes" ON public.reports;
DROP POLICY IF EXISTS "Active membership required for report updates" ON public.reports;

-- 3. Drop newly created tables (CASCADE automatically removes dependent policies and constraints)
DROP TABLE IF EXISTS public.moderation_reports CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.rate_limit_events CASCADE;
DROP TABLE IF EXISTS public.handover_records CASCADE;
DROP TABLE IF EXISTS public.claims CASCADE;
DROP TABLE IF EXISTS public.report_private_details CASCADE;
DROP TABLE IF EXISTS public.campus_desks CASCADE;
DROP TABLE IF EXISTS public.staff_allowlist CASCADE;
DROP TABLE IF EXISTS public.campus_memberships CASCADE;

-- 4. Drop added stored procedures and helper functions
DROP FUNCTION IF EXISTS public.complete_handover_resolution(UUID, TEXT, TEXT, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS public.review_claim_status(UUID, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.withdraw_claim_secure(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.submit_claim_secure(UUID, TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.create_report_secure(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.check_and_record_rate_limit(TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_current_user_desk_operator() CASCADE;
DROP FUNCTION IF EXISTS public.is_caller_active_member() CASCADE;

-- 5. Restore baseline is_current_user_admin from 20261113120000
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

-- 6. Remove added columns from reports
ALTER TABLE public.reports
  DROP COLUMN IF EXISTS brand_model,
  DROP COLUMN IF EXISTS color,
  DROP COLUMN IF EXISTS distinguishing_features,
  DROP COLUMN IF EXISTS campus_zone,
  DROP COLUMN IF EXISTS custody_status,
  DROP COLUMN IF EXISTS desk_id,
  DROP COLUMN IF EXISTS private_evidence;
