-- =============================================================================
-- LostLink — Rollback for 20261113160000_campus_recovery_handover_architecture
-- =============================================================================

-- 1. Drop trigger and membership sync function
DROP TRIGGER IF EXISTS on_user_membership_sync ON auth.users;
DROP FUNCTION IF EXISTS public.handle_user_membership_sync();

-- 2. Drop added restrictive policies on reports
DROP POLICY IF EXISTS "Active membership required for report writes" ON public.reports;
DROP POLICY IF EXISTS "Active membership required for report updates" ON public.reports;

-- 3. Drop newly created tables (CASCADE automatically removes all policies and constraints)
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
DROP FUNCTION IF EXISTS public.submit_claim_secure(UUID, TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.create_report_secure(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.check_and_record_rate_limit(TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_current_user_desk_operator() CASCADE;
DROP FUNCTION IF EXISTS public.is_caller_active_member() CASCADE;

-- 5. Remove added columns from reports
ALTER TABLE public.reports
  DROP COLUMN IF EXISTS brand_model,
  DROP COLUMN IF EXISTS color,
  DROP COLUMN IF EXISTS distinguishing_features,
  DROP COLUMN IF EXISTS campus_zone,
  DROP COLUMN IF EXISTS custody_status,
  DROP COLUMN IF EXISTS desk_id,
  DROP COLUMN IF EXISTS private_evidence;
