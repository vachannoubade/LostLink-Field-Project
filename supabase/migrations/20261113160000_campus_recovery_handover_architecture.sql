-- =============================================================================
-- LostLink — Final Campus Recovery & Helpdesk Handover Architecture
-- Migration Timestamp: 20261113160000
-- =============================================================================
-- Apply in order after 20261113120000_stage_ready_access_hardening.sql.
--
-- This migration implements:
--   1. Campus memberships (active authorization, roles, suspension/revocation).
--   2. Staff approval allowlist (administrator-controlled staff/operator access).
--   3. Structured report attributes (brand, color, zone, custody status).
--   4. Private identifying details (replacing confusing PIN for new reports).
--   5. Claims lifecycle & recovery state machine (REQUESTED -> RESOLVED).
--   6. Helpdesk custody & handover records.
--   7. Server-enforced abuse protection & rate-limit events.
--   8. Administrative audit logs & moderation abuse reports.
--   9. Configurable campus helpdesks.
--  10. Strict administrator provisioning for vachannoubade@gmail.com.
--
-- Non-destructive: preserves all existing data, auth, reports, and legacy PINs.

-- -----------------------------------------------------------------------------
-- 1. Campus Memberships Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campus_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  membership_type TEXT NOT NULL CHECK (membership_type IN ('student', 'staff', 'desk_operator', 'admin')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_membership UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON public.campus_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON public.campus_memberships(status);
CREATE INDEX IF NOT EXISTS idx_memberships_type ON public.campus_memberships(membership_type);

ALTER TABLE public.campus_memberships ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. Staff Allowlist Table
-- -----------------------------------------------------------------------------
-- Administrator-controlled pre-approved faculty and staff accounts.
CREATE TABLE IF NOT EXISTS public.staff_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  department TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'desk_operator')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_allowlist_email ON public.staff_allowlist(email);

ALTER TABLE public.staff_allowlist ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. Configurable Campus Desks Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campus_desks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  zone TEXT NOT NULL,
  building TEXT NOT NULL,
  room_number TEXT,
  hours_of_operation TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_configured BOOLEAN NOT NULL DEFAULT false, -- Clearly marks if institutional setup remains necessary
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campus_desks ENABLE ROW LEVEL SECURITY;

-- Insert default configurable helpdesk record (explicitly flagged as configuration pending)
INSERT INTO public.campus_desks (name, zone, building, room_number, hours_of_operation, is_configured, notes)
VALUES (
  'Central Campus Helpdesk',
  'Administrative Zone',
  'Student Welfare Building',
  'Room 101',
  'Mon - Fri: 09:00 - 17:00',
  false,
  'Configurable helpdesk record. Initial administrator manages handover desk testing pending official university staffing.'
)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Extend Reports Table with Structured Attributes
-- -----------------------------------------------------------------------------
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS brand_model TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS distinguishing_features TEXT,
  ADD COLUMN IF NOT EXISTS campus_zone TEXT,
  ADD COLUMN IF NOT EXISTS custody_status TEXT NOT NULL DEFAULT 'with_finder'
    CHECK (custody_status IN ('with_finder', 'handed_to_desk', 'only_observed', 'desk_custody_confirmed')),
  ADD COLUMN IF NOT EXISTS desk_id UUID REFERENCES public.campus_desks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS private_evidence TEXT;

-- Validation constraints on reports (5-70 title chars, max 700 desc chars, max 100 words)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_report_title_length') THEN
    ALTER TABLE public.reports ADD CONSTRAINT check_report_title_length CHECK (length(trim(title)) BETWEEN 5 AND 70);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_report_description_length') THEN
    ALTER TABLE public.reports ADD CONSTRAINT check_report_description_length CHECK (length(trim(description)) <= 700);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_report_location_length') THEN
    ALTER TABLE public.reports ADD CONSTRAINT check_report_location_length CHECK (length(trim(location)) <= 100);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Private Identifying Details Table (Replacing Confusing PIN)
-- -----------------------------------------------------------------------------
-- Optional private details for lost items that only genuine owners know.
-- Strictly hidden from public/other students; accessible to uploader and desk/admin.
CREATE TABLE IF NOT EXISTS public.report_private_details (
  report_id UUID PRIMARY KEY REFERENCES public.reports(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  private_detail TEXT NOT NULL CHECK (length(trim(private_detail)) BETWEEN 3 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_private_details ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 6. Claims & Recovery State Machine Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  found_report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  claimant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_lost_report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  claim_evidence TEXT NOT NULL CHECK (length(trim(claim_evidence)) BETWEEN 10 AND 500),
  status TEXT NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED', 'UNDER_REVIEW', 'APPROVED_FOR_HANDOVER', 'HANDED_OVER', 'RESOLVED', 'REJECTED', 'WITHDRAWN', 'DISPUTED')),
  review_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_claim_claimant_found UNIQUE (found_report_id, claimant_id)
);

CREATE INDEX IF NOT EXISTS idx_claims_found_report ON public.claims(found_report_id);
CREATE INDEX IF NOT EXISTS idx_claims_claimant ON public.claims(claimant_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON public.claims(status);

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 7. Helpdesk Handover Records Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.handover_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  found_report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  claimant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  desk_operator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  desk_id UUID REFERENCES public.campus_desks(id) ON DELETE SET NULL,
  desk_location TEXT NOT NULL DEFAULT 'Central Campus Helpdesk',
  handover_status TEXT NOT NULL DEFAULT 'PENDING_PHYSICAL_CONFIRMATION'
    CHECK (handover_status IN ('PENDING_PHYSICAL_CONFIRMATION', 'CUSTODY_VERIFIED', 'COMPLETED', 'CANCELLED')),
  item_condition_notes TEXT,
  claimant_id_verified BOOLEAN NOT NULL DEFAULT false,
  receipt_confirmed BOOLEAN NOT NULL DEFAULT false,
  handed_over_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_handovers_claim ON public.handover_records(claim_id);
CREATE INDEX IF NOT EXISTS idx_handovers_status ON public.handover_records(handover_status);

ALTER TABLE public.handover_records ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 8. Server-Enforced Abuse Protection & Rate Limiting Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('new_report', 'report_edit', 'new_claim', 'abuse_report')),
  target_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action ON public.rate_limit_events(user_id, action_type, created_at DESC);

ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 9. Administrative Audit History Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 10. Moderation & Abuse Reports Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.moderation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'inappropriate', 'fraudulent', 'duplicate', 'other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REVIEWED', 'DISMISSED', 'ACTIONED')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_reports_status ON public.moderation_reports(status);

ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Authorization Functions & Row Level Security (RLS)
-- =============================================================================

-- Helper: Check if caller is active campus member (not suspended or revoked)
CREATE OR REPLACE FUNCTION public.is_caller_active_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campus_memberships cm
    WHERE cm.user_id = auth.uid()
      AND cm.status = 'ACTIVE'
      AND (cm.expires_at IS NULL OR cm.expires_at > now())
  ) OR public.is_current_user_admin();
$$;

REVOKE ALL ON FUNCTION public.is_caller_active_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_caller_active_member() TO authenticated;

-- Helper: Check if caller is authorized desk operator or admin
CREATE OR REPLACE FUNCTION public.is_current_user_desk_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_current_user_admin() OR EXISTS (
    SELECT 1 FROM public.campus_memberships cm
    WHERE cm.user_id = auth.uid()
      AND cm.status = 'ACTIVE'
      AND cm.membership_type IN ('desk_operator', 'admin')
  ) OR coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('desk_operator', 'admin');
$$;

REVOKE ALL ON FUNCTION public.is_current_user_desk_operator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_desk_operator() TO authenticated;

-- -----------------------------------------------------------------------------
-- Rate Limiting Enforcement Function
-- -----------------------------------------------------------------------------
-- Enforces:
--   * New reports: max 3/hour, max 10/day per user
--   * Report edits: max 20/day per report
--   * New claims: max 5/day per user
--   * Abuse reports: max 10/day per user
CREATE OR REPLACE FUNCTION public.check_and_record_rate_limit(
  p_action TEXT,
  p_target_id UUID DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_count_hour INT;
  v_count_day INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Admins bypass rate limits for administrative tasks
  IF public.is_current_user_admin() THEN
    RETURN true;
  END IF;

  IF p_action = 'new_report' THEN
    SELECT count(*) INTO v_count_hour
    FROM public.rate_limit_events
    WHERE user_id = v_uid AND action_type = 'new_report' AND created_at > now() - INTERVAL '1 hour';

    IF v_count_hour >= 3 THEN
      RAISE EXCEPTION 'Rate limit exceeded: You can submit at most 3 reports per hour. Please wait.';
    END IF;

    SELECT count(*) INTO v_count_day
    FROM public.rate_limit_events
    WHERE user_id = v_uid AND action_type = 'new_report' AND created_at > now() - INTERVAL '24 hours';

    IF v_count_day >= 10 THEN
      RAISE EXCEPTION 'Rate limit exceeded: Daily limit of 10 reports reached. Please return tomorrow.';
    END IF;

  ELSIF p_action = 'report_edit' THEN
    IF p_target_id IS NOT NULL THEN
      SELECT count(*) INTO v_count_day
      FROM public.rate_limit_events
      WHERE user_id = v_uid AND action_type = 'report_edit' AND target_id = p_target_id AND created_at > now() - INTERVAL '24 hours';

      IF v_count_day >= 20 THEN
        RAISE EXCEPTION 'Rate limit exceeded: This report has reached its daily edit quota (20 edits/day).';
      END IF;
    END IF;

  ELSIF p_action = 'new_claim' THEN
    SELECT count(*) INTO v_count_day
    FROM public.rate_limit_events
    WHERE user_id = v_uid AND action_type = 'new_claim' AND created_at > now() - INTERVAL '24 hours';

    IF v_count_day >= 5 THEN
      RAISE EXCEPTION 'Rate limit exceeded: You can submit at most 5 ownership claims per day.';
    END IF;

  ELSIF p_action = 'abuse_report' THEN
    SELECT count(*) INTO v_count_day
    FROM public.rate_limit_events
    WHERE user_id = v_uid AND action_type = 'abuse_report' AND created_at > now() - INTERVAL '24 hours';

    IF v_count_day >= 10 THEN
      RAISE EXCEPTION 'Rate limit exceeded: Daily moderation report limit reached.';
    END IF;
  END IF;

  INSERT INTO public.rate_limit_events (user_id, action_type, target_id)
  VALUES (v_uid, p_action, p_target_id);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_record_rate_limit(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_record_rate_limit(TEXT, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- RLS Policies for New Tables
-- -----------------------------------------------------------------------------

-- campus_memberships:
-- Active users can view their own membership; desk operators and admins can view all.
DROP POLICY IF EXISTS "Users can view own membership" ON public.campus_memberships;
CREATE POLICY "Users can view own membership"
  ON public.campus_memberships FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_current_user_desk_operator());

-- Only administrators can modify memberships
DROP POLICY IF EXISTS "Admins manage memberships" ON public.campus_memberships;
CREATE POLICY "Admins manage memberships"
  ON public.campus_memberships FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- staff_allowlist:
-- Only administrators can read or manage the staff allowlist
DROP POLICY IF EXISTS "Admins manage staff allowlist" ON public.staff_allowlist;
CREATE POLICY "Admins manage staff allowlist"
  ON public.staff_allowlist FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- campus_desks:
-- Campus desks are viewable by all authenticated users; managed by admins
DROP POLICY IF EXISTS "Campus desks are viewable by authenticated users" ON public.campus_desks;
CREATE POLICY "Campus desks are viewable by authenticated users"
  ON public.campus_desks FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage campus desks" ON public.campus_desks;
CREATE POLICY "Admins manage campus desks"
  ON public.campus_desks FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- report_private_details:
-- Visible ONLY to report owner or authorized desk operators / admins
DROP POLICY IF EXISTS "Owner or desk can view private report details" ON public.report_private_details;
CREATE POLICY "Owner or desk can view private report details"
  ON public.report_private_details FOR SELECT TO authenticated
  USING (auth.uid() = owner_id OR public.is_current_user_desk_operator());

DROP POLICY IF EXISTS "Owners can manage private details" ON public.report_private_details;
CREATE POLICY "Owners can manage private details"
  ON public.report_private_details FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- claims:
-- Claimants can view own claims; desk operators & admins can view all claims
DROP POLICY IF EXISTS "Claimants can view own claims" ON public.claims;
CREATE POLICY "Claimants can view own claims"
  ON public.claims FOR SELECT TO authenticated
  USING (auth.uid() = claimant_id OR public.is_current_user_desk_operator());

DROP POLICY IF EXISTS "Active members can create claims" ON public.claims;
CREATE POLICY "Active members can create claims"
  ON public.claims FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = claimant_id AND public.is_caller_active_member());

DROP POLICY IF EXISTS "Claimants can withdraw own claims" ON public.claims;
CREATE POLICY "Claimants can withdraw own claims"
  ON public.claims FOR UPDATE TO authenticated
  USING (auth.uid() = claimant_id OR public.is_current_user_desk_operator())
  WITH CHECK (auth.uid() = claimant_id OR public.is_current_user_desk_operator());

-- handover_records:
-- Claimant can view their own handover record; desk operators/admins can view & manage
DROP POLICY IF EXISTS "Claimants can view own handover records" ON public.handover_records;
CREATE POLICY "Claimants can view own handover records"
  ON public.handover_records FOR SELECT TO authenticated
  USING (auth.uid() = claimant_id OR public.is_current_user_desk_operator());

DROP POLICY IF EXISTS "Desk operators manage handover records" ON public.handover_records;
CREATE POLICY "Desk operators manage handover records"
  ON public.handover_records FOR ALL TO authenticated
  USING (public.is_current_user_desk_operator())
  WITH CHECK (public.is_current_user_desk_operator());

-- audit_logs:
-- Only administrators can view audit logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

-- moderation_reports:
-- Reporter can view own; admins can view & manage
DROP POLICY IF EXISTS "Reporters view own abuse reports" ON public.moderation_reports;
CREATE POLICY "Reporters view own abuse reports"
  ON public.moderation_reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR public.is_current_user_admin());

DROP POLICY IF EXISTS "Active users can insert abuse reports" ON public.moderation_reports;
CREATE POLICY "Active users can insert abuse reports"
  ON public.moderation_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id AND public.is_caller_active_member());

DROP POLICY IF EXISTS "Admins manage abuse reports" ON public.moderation_reports;
CREATE POLICY "Admins manage abuse reports"
  ON public.moderation_reports FOR UPDATE TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- rate_limit_events:
-- Managed strictly by security definer function; users can only view their own
DROP POLICY IF EXISTS "Users can view own rate limit events" ON public.rate_limit_events;
CREATE POLICY "Users can view own rate limit events"
  ON public.rate_limit_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 11. Restrictive Membership Guard on Existing Tables
-- -----------------------------------------------------------------------------
-- Revoked or suspended members are blocked from creating or modifying reports/claims
DROP POLICY IF EXISTS "Active membership required for report writes" ON public.reports;
CREATE POLICY "Active membership required for report writes"
  ON public.reports AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.is_caller_active_member());

DROP POLICY IF EXISTS "Active membership required for report updates" ON public.reports;
CREATE POLICY "Active membership required for report updates"
  ON public.reports AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.is_caller_active_member())
  WITH CHECK (public.is_caller_active_member());

-- Table privileges for authenticated users (enforced via RLS above)
GRANT SELECT ON public.campus_memberships TO authenticated;
GRANT SELECT ON public.staff_allowlist TO authenticated;
GRANT SELECT ON public.campus_desks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_private_details TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claims TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.handover_records TO authenticated;
GRANT SELECT, INSERT ON public.rate_limit_events TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.moderation_reports TO authenticated;

-- -----------------------------------------------------------------------------
-- 12. Updated Signup Enforcement Trigger (Student PRN, Staff Allowlist, Admin)
-- -----------------------------------------------------------------------------
-- Locked Decision:
-- 1. Initial administrator: vachannoubade@gmail.com MUST have raw_app_meta_data.role = 'admin'
--    It cannot be registered as an admin through public signup.
-- 2. Faculty / Staff: must exist in public.staff_allowlist with is_active = true.
-- 3. Students: numeric PRN ^[0-9]{6,16}@sguk\.ac\.in$
-- 4. Existing accounts are preserved (BEFORE INSERT only).
CREATE OR REPLACE FUNCTION public.enforce_college_email_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  normalized_email text;
  prn text;
  v_staff_role text;
BEGIN
  normalized_email := lower(btrim(coalesce(NEW.email, '')));

  -- 1. Explicit Administrator exception: vachannoubade@gmail.com
  -- MUST be provisioned with server-controlled app_metadata.role = 'admin'
  IF normalized_email = 'vachannoubade@gmail.com' THEN
    IF NEW.raw_app_meta_data IS NULL OR coalesce(NEW.raw_app_meta_data ->> 'role', '') <> 'admin' THEN
      RAISE EXCEPTION 'The administrator account can only be provisioned through secure server administration.';
    END IF;
    NEW.email := normalized_email;
    RETURN NEW;
  END IF;

  -- 2. Other admin accounts provisioned server-side with role=admin
  IF NEW.raw_app_meta_data IS NOT NULL AND NEW.raw_app_meta_data ->> 'role' = 'admin' THEN
    NEW.email := normalized_email;
    RETURN NEW;
  END IF;

  -- 3. Staff & Faculty Allowlist check
  SELECT role INTO v_staff_role
  FROM public.staff_allowlist
  WHERE email = normalized_email AND is_active = true;

  IF FOUND THEN
    NEW.email := normalized_email;
    IF NEW.raw_user_meta_data IS NULL OR jsonb_typeof(NEW.raw_user_meta_data) <> 'object' THEN
      NEW.raw_user_meta_data := '{}'::jsonb;
    END IF;
    NEW.raw_user_meta_data := NEW.raw_user_meta_data || jsonb_build_object('role', v_staff_role, 'is_staff', true);
    RETURN NEW;
  END IF;

  -- 4. Student check: must match numeric PRN at sguk.ac.in
  IF normalized_email !~ '^[0-9]{6,16}@sguk\.ac\.in$' THEN
    RAISE EXCEPTION 'Only SGUK students with a valid numeric PRN email (yourPRN@sguk.ac.in) or approved faculty/staff can register.';
  END IF;

  prn := split_part(normalized_email, '@', 1);
  NEW.email := normalized_email;
  IF NEW.raw_user_meta_data IS NULL OR jsonb_typeof(NEW.raw_user_meta_data) <> 'object' THEN
    NEW.raw_user_meta_data := '{}'::jsonb;
  END IF;
  NEW.raw_user_meta_data := NEW.raw_user_meta_data || jsonb_build_object('prn', prn, 'role', 'student');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_college_email_domain ON auth.users;
CREATE TRIGGER enforce_college_email_domain
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_college_email_domain();

REVOKE EXECUTE ON FUNCTION public.enforce_college_email_domain() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 13. Synchronize Campus Memberships on User Signup
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_user_membership_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_status text;
BEGIN
  IF NEW.raw_app_meta_data IS NOT NULL AND NEW.raw_app_meta_data ->> 'role' = 'admin' THEN
    v_role := 'admin';
    v_status := 'ACTIVE';
  ELSIF NEW.raw_user_meta_data IS NOT NULL AND NEW.raw_user_meta_data ->> 'is_staff' = 'true' THEN
    v_role := coalesce(NEW.raw_user_meta_data ->> 'role', 'staff');
    v_status := 'ACTIVE';
  ELSE
    v_role := 'student';
    v_status := 'ACTIVE';
  END IF;

  INSERT INTO public.campus_memberships (user_id, membership_type, status, approved_at)
  VALUES (NEW.id, v_role, v_status, now())
  ON CONFLICT (user_id) DO UPDATE SET
    membership_type = EXCLUDED.membership_type,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_membership_sync ON auth.users;
CREATE TRIGGER on_user_membership_sync
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_membership_sync();

REVOKE EXECUTE ON FUNCTION public.handle_user_membership_sync() FROM PUBLIC;

-- Backfill memberships for any existing auth.users without one
INSERT INTO public.campus_memberships (user_id, membership_type, status, approved_at)
SELECT
  u.id,
  CASE
    WHEN u.raw_app_meta_data ->> 'role' = 'admin' THEN 'admin'
    WHEN u.raw_user_meta_data ->> 'is_staff' = 'true' THEN 'staff'
    ELSE 'student'
  END,
  'ACTIVE',
  now()
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 14. Server-Side Atomic Procedures: Report Creation & Claim Submission
-- -----------------------------------------------------------------------------

-- Procedure: Secure Report Creation with server validation and rate limiting
CREATE OR REPLACE FUNCTION public.create_report_secure(
  p_type TEXT,
  p_title TEXT,
  p_category TEXT,
  p_description TEXT,
  p_location TEXT,
  p_date DATE,
  p_brand_model TEXT DEFAULT NULL,
  p_color TEXT DEFAULT NULL,
  p_distinguishing_features TEXT DEFAULT NULL,
  p_campus_zone TEXT DEFAULT NULL,
  p_custody_status TEXT DEFAULT 'with_finder',
  p_image_url TEXT DEFAULT NULL,
  p_private_evidence TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_report_id UUID;
  v_word_count INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- 1. Check membership status
  IF NOT public.is_caller_active_member() THEN
    RAISE EXCEPTION 'Your campus account is not active. Please contact administrator.';
  END IF;

  -- 2. Server validation limits
  IF p_type NOT IN ('lost', 'found') THEN
    RAISE EXCEPTION 'Report type must be lost or found.';
  END IF;

  IF length(trim(coalesce(p_title, ''))) < 5 OR length(trim(coalesce(p_title, ''))) > 70 THEN
    RAISE EXCEPTION 'Title must be between 5 and 70 characters.';
  END IF;

  IF length(trim(coalesce(p_description, ''))) = 0 OR length(trim(coalesce(p_description, ''))) > 700 THEN
    RAISE EXCEPTION 'Description must be between 1 and 700 characters.';
  END IF;

  SELECT array_length(regexp_split_to_array(trim(p_description), '\s+'), 1) INTO v_word_count;
  IF v_word_count > 100 THEN
    RAISE EXCEPTION 'Description exceeds maximum allowed word count of 100 words.';
  END IF;

  IF length(trim(coalesce(p_location, ''))) = 0 OR length(trim(coalesce(p_location, ''))) > 100 THEN
    RAISE EXCEPTION 'Location must be between 1 and 100 characters.';
  END IF;

  IF p_private_evidence IS NOT NULL AND length(trim(p_private_evidence)) > 300 THEN
    RAISE EXCEPTION 'Private evidence detail cannot exceed 300 characters.';
  END IF;

  -- 3. Rate limiting check (3/hr, 10/day)
  PERFORM public.check_and_record_rate_limit('new_report');

  -- 4. Insert report
  INSERT INTO public.reports (
    user_id, type, title, category, description, location, date,
    brand_model, color, distinguishing_features, campus_zone,
    custody_status, image_url, status, has_private_verification
  )
  VALUES (
    v_uid, p_type, trim(p_title), p_category, trim(p_description), trim(p_location), p_date,
    nullif(trim(p_brand_model), ''), nullif(trim(p_color), ''), nullif(trim(p_distinguishing_features), ''),
    nullif(trim(p_campus_zone), ''), p_custody_status, p_image_url, p_type,
    (p_private_evidence IS NOT NULL AND length(trim(p_private_evidence)) >= 3)
  )
  RETURNING id INTO v_report_id;

  -- 5. Insert private identifying evidence if provided (strictly restricted)
  IF p_private_evidence IS NOT NULL AND length(trim(p_private_evidence)) >= 3 THEN
    INSERT INTO public.report_private_details (report_id, owner_id, private_detail)
    VALUES (v_report_id, v_uid, trim(p_private_evidence));
  END IF;

  -- 6. Log audit event
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (v_uid, 'REPORT_CREATED', 'report', v_report_id, jsonb_build_object('type', p_type, 'title', p_title));

  RETURN v_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_report_secure FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_report_secure TO authenticated;

-- Procedure: Secure Ownership Claim Submission ("This might be mine")
CREATE OR REPLACE FUNCTION public.submit_claim_secure(
  p_found_report_id UUID,
  p_claim_evidence TEXT,
  p_linked_lost_report_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_found_report public.reports;
  v_claim_id UUID;
  v_competing_claims INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT public.is_caller_active_member() THEN
    RAISE EXCEPTION 'Active campus account required to submit a claim.';
  END IF;

  -- Validate found report
  SELECT * INTO v_found_report FROM public.reports WHERE id = p_found_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target report not found.';
  END IF;

  IF v_found_report.status = 'resolved' THEN
    RAISE EXCEPTION 'This report is already resolved and no longer accepting claims.';
  END IF;

  IF v_found_report.user_id = v_uid THEN
    RAISE EXCEPTION 'You cannot claim an item that you reported finding.';
  END IF;

  -- Validate claim evidence length (10 - 500 chars)
  IF length(trim(coalesce(p_claim_evidence, ''))) < 10 OR length(trim(coalesce(p_claim_evidence, ''))) > 500 THEN
    RAISE EXCEPTION 'Claim evidence must be between 10 and 500 characters.';
  END IF;

  -- Rate limit check (max 5 claims per day)
  PERFORM public.check_and_record_rate_limit('new_claim', p_found_report_id);

  -- Check existing active claim by caller for this found item
  IF EXISTS (
    SELECT 1 FROM public.claims
    WHERE found_report_id = p_found_report_id
      AND claimant_id = v_uid
      AND status NOT IN ('REJECTED', 'WITHDRAWN')
  ) THEN
    RAISE EXCEPTION 'You already have an active claim submitted for this item.';
  END IF;

  -- Check if other competing claims exist -> trigger dispute workflow
  SELECT count(*) INTO v_competing_claims
  FROM public.claims
  WHERE found_report_id = p_found_report_id
    AND status IN ('REQUESTED', 'UNDER_REVIEW', 'APPROVED_FOR_HANDOVER');

  INSERT INTO public.claims (
    found_report_id, claimant_id, linked_lost_report_id, claim_evidence, status
  )
  VALUES (
    p_found_report_id, v_uid, p_linked_lost_report_id, trim(p_claim_evidence),
    CASE WHEN v_competing_claims > 0 THEN 'DISPUTED' ELSE 'REQUESTED' END
  )
  RETURNING id INTO v_claim_id;

  -- If competing claims exist, mark previous active claims as DISPUTED for administrative review
  IF v_competing_claims > 0 THEN
    UPDATE public.claims
    SET status = 'DISPUTED', updated_at = now()
    WHERE found_report_id = p_found_report_id
      AND status IN ('REQUESTED', 'UNDER_REVIEW', 'APPROVED_FOR_HANDOVER')
      AND id <> v_claim_id;
  END IF;

  -- Notify finder
  INSERT INTO public.notifications (user_id, title, message, link, read)
  VALUES (
    v_found_report.user_id,
    'New Ownership Claim Submitted',
    'A student submitted an ownership claim for your found item "' || v_found_report.title || '". It is currently pending helpdesk review.',
    '/items/' || p_found_report_id,
    false
  );

  -- Audit log
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (v_uid, 'CLAIM_SUBMITTED', 'claim', v_claim_id, jsonb_build_object('found_report_id', p_found_report_id));

  RETURN v_claim_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_claim_secure FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_claim_secure TO authenticated;

-- -----------------------------------------------------------------------------
-- 15. Server-Side Atomic Procedure: Complete Handover & Resolution
-- -----------------------------------------------------------------------------
-- Only authorized desk operator or admin can execute this.
-- Records physical confirmation, verifies claimant ID, marks handover COMPLETED,
-- resolves reports, rejects competing claims, and logs audit event.
CREATE OR REPLACE FUNCTION public.complete_handover_resolution(
  p_claim_id UUID,
  p_desk_location TEXT,
  p_condition_notes TEXT,
  p_id_verified BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_claim public.claims;
  v_found_report public.reports;
  v_handover_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT public.is_current_user_desk_operator() THEN
    RAISE EXCEPTION 'Permission denied: Only authorized desk operators or administrators can authorize physical handovers.';
  END IF;

  IF NOT p_id_verified THEN
    RAISE EXCEPTION 'Student identity and PRN must be physically verified prior to authorizing item handover.';
  END IF;

  SELECT * INTO v_claim FROM public.claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim record not found.';
  END IF;

  IF v_claim.status IN ('HANDED_OVER', 'RESOLVED') THEN
    RAISE EXCEPTION 'Handover has already been completed for this claim.';
  END IF;

  SELECT * INTO v_found_report FROM public.reports WHERE id = v_claim.found_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated found report not found.';
  END IF;

  -- 1. Create Handover Record
  INSERT INTO public.handover_records (
    claim_id, found_report_id, claimant_id, desk_operator_id,
    desk_location, handover_status, item_condition_notes,
    claimant_id_verified, receipt_confirmed, handed_over_at
  )
  VALUES (
    p_claim_id, v_claim.found_report_id, v_claim.claimant_id, v_caller_id,
    coalesce(nullif(trim(p_desk_location), ''), 'Central Campus Helpdesk'),
    'COMPLETED', trim(p_condition_notes),
    true, true, now()
  )
  RETURNING id INTO v_handover_id;

  -- 2. Update Claim status
  UPDATE public.claims
  SET status = 'RESOLVED',
      reviewed_by = v_caller_id,
      reviewed_at = now(),
      review_notes = coalesce(review_notes || E'\n', '') || 'Handover completed at desk by operator.',
      updated_at = now()
  WHERE id = p_claim_id;

  -- 3. Resolve Found Report
  UPDATE public.reports
  SET status = 'resolved',
      custody_status = 'desk_custody_confirmed',
      updated_at = now()
  WHERE id = v_claim.found_report_id;

  -- 4. If claimant linked their lost report, resolve that too
  IF v_claim.linked_lost_report_id IS NOT NULL THEN
    UPDATE public.reports
    SET status = 'resolved',
        updated_at = now()
    WHERE id = v_claim.linked_lost_report_id;
  END IF;

  -- 5. Reject any other competing claims for this found item
  UPDATE public.claims
  SET status = 'REJECTED',
      review_notes = 'Item resolved and returned to verified claimant via campus helpdesk.',
      updated_at = now()
  WHERE found_report_id = v_claim.found_report_id
    AND id <> p_claim_id
    AND status NOT IN ('RESOLVED', 'REJECTED');

  -- 6. Notify claimant
  INSERT INTO public.notifications (user_id, title, message, link, read)
  VALUES (
    v_claim.claimant_id,
    'Item Handover Completed',
    'Your claim for "' || v_found_report.title || '" has been verified and physical handover is complete. The item is resolved.',
    '/my-reports',
    false
  );

  -- 7. Audit log
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_caller_id,
    'HANDOVER_COMPLETED',
    'handover_record',
    v_handover_id,
    jsonb_build_object(
      'claim_id', p_claim_id,
      'found_report_id', v_claim.found_report_id,
      'claimant_id', v_claim.claimant_id,
      'desk_location', p_desk_location
    )
  );

  RETURN jsonb_build_object('success', true, 'handover_id', v_handover_id);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_handover_resolution FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_handover_resolution TO authenticated;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
