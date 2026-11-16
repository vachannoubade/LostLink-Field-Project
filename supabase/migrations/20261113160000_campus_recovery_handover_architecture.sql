-- =============================================================================
-- LostLink — Final Campus Recovery & Helpdesk Handover Architecture (Hardened)
-- Migration Timestamp: 20261113160000
-- =============================================================================
-- Apply in order after 20261113120000_stage_ready_access_hardening.sql.
--
-- Security Hardening Enhancements:
--   1. Direct API Bypasses Closed:
--      - Direct mutations on claims, handovers, memberships, and staff allowlist
--        are revoked from authenticated role and routed exclusively via secure RPCs.
--      - Direct INSERT/UPDATE on reports and moderation_reports guarded by strict
--        BEFORE triggers enforcing ownership, quotas, validation, and state machines.
--   2. Claim-Status Manipulation Prevented:
--      - Explicit authorized state machine (REQUESTED -> UNDER_REVIEW ->
--        APPROVED_FOR_HANDOVER -> RESOLVED).
--      - Claimants can only withdraw; only desk operators/admins can review/approve.
--      - Handover procedure is atomic with comprehensive audit logs.
--   3. Secure Physical Handovers:
--      - complete_handover_resolution accepts ONLY claims in APPROVED_FOR_HANDOVER status.
--      - Rejects REQUESTED, UNDER_REVIEW, DISPUTED, REJECTED, WITHDRAWN, RESOLVED.
--      - Validates found and linked lost reports (active, correct types, ownership).
--      - Requires physical ID verification and condition notes; blocks duplicate handovers.
--   4. Universal Membership Revocation:
--      - Suspended and revoked users immediately lose report, image, claim, and
--        private detail access. Stale JWT admin/desk claims cannot bypass revocation.
--   5. Concurrency-Safe Quotas:
--      - Rate limits use PostgreSQL transaction advisory locks (pg_advisory_xact_lock)
--        to prevent TOCTOU race conditions. Validates all supported action types.
--   6. Staff Trust Hardened:
--      - Membership sync never trusts user-editable user_metadata; checks only staff_allowlist.
--   7. Safe Rollback:
--      - Non-destructive safety checks protect production audit logs and recovery records.

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
  is_configured BOOLEAN NOT NULL DEFAULT false,
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
-- 5. Private Identifying Details Table
-- -----------------------------------------------------------------------------
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
  action_type TEXT NOT NULL CHECK (action_type IN ('new_report', 'report_edit', 'new_claim', 'abuse_report', 'upload_image')),
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
  );
$$;

REVOKE ALL ON FUNCTION public.is_caller_active_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_caller_active_member() TO authenticated;

-- Helper: Check if caller is administrator (must have app_metadata role=admin AND active unexpired admin membership)
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.campus_memberships cm ON cm.user_id = u.id
    WHERE u.id = auth.uid()
      AND coalesce(u.raw_app_meta_data ->> 'role', '') = 'admin'
      AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      AND cm.membership_type = 'admin'
      AND cm.status = 'ACTIVE'
      AND (cm.expires_at IS NULL OR cm.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated, anon;

-- Helper: Check if caller is authorized desk operator or active admin
CREATE OR REPLACE FUNCTION public.is_current_user_desk_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_current_user_admin() OR (
    public.is_caller_active_member() AND EXISTS (
      SELECT 1 FROM public.campus_memberships cm
      WHERE cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
        AND cm.membership_type IN ('desk_operator', 'admin')
        AND (cm.expires_at IS NULL OR cm.expires_at > now())
    )
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_desk_operator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_desk_operator() TO authenticated;

-- Helper: Dedicated Server-Side Admin Authorization Function (verifies admin status and target identity)
CREATE OR REPLACE FUNCTION public.can_access_admin_portal()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.is_current_user_admin() AND EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.campus_memberships cm ON cm.user_id = u.id
    WHERE u.id = auth.uid()
      AND (
        lower(u.email) = 'vachannoubade@gmail.com'
        OR coalesce(cm.notes, '') LIKE '%explicitly_provisioned%'
        OR u.raw_app_meta_data ? 'admin_provisioned_at'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_admin_portal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_admin_portal() TO authenticated;

-- Hardened storage image access: suspended or revoked users cannot access ANY report images
CREATE OR REPLACE FUNCTION public.can_access_report_image(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  caller_id uuid;
  path_owner text;
  attached_report public.reports%ROWTYPE;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RETURN false;
  END IF;

  -- Suspended or revoked members are immediately denied all image access
  IF NOT public.is_caller_active_member() THEN
    RETURN false;
  END IF;

  -- Administrators have full read access to images for audit and recovery
  IF public.is_current_user_admin() THEN
    RETURN true;
  END IF;

  path_owner := (storage.foldername(object_name))[1];

  SELECT * INTO attached_report
  FROM public.reports
  WHERE image_url = object_name
     OR image_url = 'report-images/' || object_name
     OR image_url LIKE '%' || object_name
  LIMIT 1;

  IF FOUND THEN
    -- Resolved report images are strictly restricted to administrators
    IF attached_report.status = 'resolved' THEN
      RETURN false;
    END IF;

    -- Sensitive folder images are strictly restricted to owner and administrator
    IF object_name LIKE '%/sensitive/%' THEN
      RETURN caller_id::text = attached_report.user_id::text;
    END IF;

    -- Normal active report image: if under owner's folder, any active authenticated campus member can view
    IF path_owner = attached_report.user_id::text THEN
      RETURN true;
    END IF;

    RETURN caller_id::text = attached_report.user_id::text;
  END IF;

  -- Unattached image: only the path owner can access
  IF object_name LIKE '%/sensitive/%' THEN
    RETURN caller_id::text = path_owner;
  END IF;

  RETURN caller_id::text = path_owner;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_report_image(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_report_image(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- Concurrency-Safe Rate Limiting Function (Advisory Locks)
-- -----------------------------------------------------------------------------
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

  -- Validate supported action types
  IF p_action NOT IN ('new_report', 'report_edit', 'new_claim', 'abuse_report', 'upload_image') THEN
    RAISE EXCEPTION 'Unsupported rate limit action type: %', p_action;
  END IF;

  -- Active administrators bypass rate limits for operations
  IF public.is_current_user_admin() THEN
    RETURN true;
  END IF;

  -- Acquire a transaction-level advisory lock to serialize quota checks for this user and action
  -- Prevents concurrent race conditions (count-then-insert TOCTOU)
  PERFORM pg_advisory_xact_lock(
    hashtext('rate_limit:' || v_uid::text),
    hashtext(p_action)
  );

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
    ELSE
      SELECT count(*) INTO v_count_day
      FROM public.rate_limit_events
      WHERE user_id = v_uid AND action_type = 'report_edit' AND created_at > now() - INTERVAL '24 hours';

      IF v_count_day >= 20 THEN
        RAISE EXCEPTION 'Rate limit exceeded: Daily edit limit of 20 edits reached.';
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

  ELSIF p_action = 'upload_image' THEN
    SELECT count(*) INTO v_count_hour
    FROM public.rate_limit_events
    WHERE user_id = v_uid AND action_type = 'upload_image' AND created_at > now() - INTERVAL '1 hour';

    IF v_count_hour >= 15 THEN
      RAISE EXCEPTION 'Rate limit exceeded: Maximum 15 image uploads per hour.';
    END IF;

    SELECT count(*) INTO v_count_day
    FROM public.rate_limit_events
    WHERE user_id = v_uid AND action_type = 'upload_image' AND created_at > now() - INTERVAL '24 hours';

    IF v_count_day >= 30 THEN
      RAISE EXCEPTION 'Rate limit exceeded: Daily upload limit of 30 images reached.';
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
-- Direct API Bypass Defenses: Report Mutation Guard Trigger
-- -----------------------------------------------------------------------------
-- Prevents any direct PostgREST INSERT or UPDATE on public.reports from bypassing
-- ownership checks, quotas, active membership, title/desc length limits, or report status.
CREATE OR REPLACE FUNCTION public.trg_enforce_report_mutation_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_word_count INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Authentication required.';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT public.is_caller_active_member() THEN
    RAISE EXCEPTION 'Active campus account required to create or modify reports.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Enforce ownership: caller cannot forge user_id
    IF NEW.user_id IS NULL OR NEW.user_id <> v_uid THEN
      NEW.user_id := v_uid;
    END IF;

    -- Enforce initial status matches report type (never allow direct insertion of 'resolved')
    IF NEW.status IS NULL OR NEW.status <> NEW.type THEN
      NEW.status := NEW.type;
    END IF;

    -- Validation constraints
    IF NEW.type NOT IN ('lost', 'found') THEN
      RAISE EXCEPTION 'Report type must be lost or found.';
    END IF;

    IF length(trim(coalesce(NEW.title, ''))) < 5 OR length(trim(coalesce(NEW.title, ''))) > 70 THEN
      RAISE EXCEPTION 'Title must be between 5 and 70 characters.';
    END IF;

    IF length(trim(coalesce(NEW.description, ''))) = 0 OR length(trim(coalesce(NEW.description, ''))) > 700 THEN
      RAISE EXCEPTION 'Description must be between 1 and 700 characters.';
    END IF;

    SELECT array_length(regexp_split_to_array(trim(NEW.description), '\s+'), 1) INTO v_word_count;
    IF v_word_count > 100 THEN
      RAISE EXCEPTION 'Description exceeds maximum allowed word count of 100 words.';
    END IF;

    IF length(trim(coalesce(NEW.location, ''))) = 0 OR length(trim(coalesce(NEW.location, ''))) > 100 THEN
      RAISE EXCEPTION 'Location must be between 1 and 100 characters.';
    END IF;

    IF NEW.custody_status IS NOT NULL AND NEW.custody_status NOT IN ('with_finder', 'handed_to_desk', 'only_observed', 'desk_custody_confirmed') THEN
      RAISE EXCEPTION 'Invalid custody status.';
    END IF;

    -- Record concurrency-safe rate limit for new reports (if not already recorded in same transaction)
    PERFORM public.check_and_record_rate_limit('new_report');

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- If called within verified handover or resolution procedure, allow status update
    IF coalesce(current_setting('lostlink.in_handover_rpc', true), 'false') = 'true' THEN
      NEW.updated_at := now();
      RETURN NEW;
    END IF;

    -- Ownership check: non-admins and non-desk-operators can only modify their own reports
    IF NOT (public.is_current_user_admin() OR public.is_current_user_desk_operator()) THEN
      IF OLD.user_id <> v_uid THEN
        RAISE EXCEPTION 'Permission denied: You can only edit your own reports.';
      END IF;

      -- Cannot transfer report ownership
      NEW.user_id := OLD.user_id;

      -- Cannot change report type
      NEW.type := OLD.type;

      -- Non-admin cannot directly mark report as resolved via PATCH (must use resolve_report RPC or desk handover)
      IF NEW.status = 'resolved' AND OLD.status <> 'resolved' THEN
        -- Allow if owner via resolve_report procedure, otherwise block arbitrary direct status change
        IF coalesce(current_setting('lostlink.in_resolve_rpc', true), 'false') <> 'true' THEN
          RAISE EXCEPTION 'Reports can only be resolved via authorized desk handover or verified resolution procedure.';
        END IF;
      END IF;

      -- Validation if fields changed
      IF NEW.title IS DISTINCT FROM OLD.title THEN
        IF length(trim(coalesce(NEW.title, ''))) < 5 OR length(trim(coalesce(NEW.title, ''))) > 70 THEN
          RAISE EXCEPTION 'Title must be between 5 and 70 characters.';
        END IF;
      END IF;

      IF NEW.description IS DISTINCT FROM OLD.description THEN
        IF length(trim(coalesce(NEW.description, ''))) = 0 OR length(trim(coalesce(NEW.description, ''))) > 700 THEN
          RAISE EXCEPTION 'Description must be between 1 and 700 characters.';
        END IF;
        SELECT array_length(regexp_split_to_array(trim(NEW.description), '\s+'), 1) INTO v_word_count;
        IF v_word_count > 100 THEN
          RAISE EXCEPTION 'Description exceeds maximum allowed word count of 100 words.';
        END IF;
      END IF;

      IF NEW.location IS DISTINCT FROM OLD.location THEN
        IF length(trim(coalesce(NEW.location, ''))) = 0 OR length(trim(coalesce(NEW.location, ''))) > 100 THEN
          RAISE EXCEPTION 'Location must be between 1 and 100 characters.';
        END IF;
      END IF;

      -- Record concurrency-safe rate limit for report edit
      PERFORM public.check_and_record_rate_limit('report_edit', OLD.id);
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_report_mutation_rules ON public.reports;
CREATE TRIGGER trg_enforce_report_mutation_rules
  BEFORE INSERT OR UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_report_mutation_rules();

REVOKE ALL ON FUNCTION public.trg_enforce_report_mutation_rules() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- Direct API Bypass Defenses: Moderation Reports Guard Trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_enforce_moderation_report_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Authentication required.';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT public.is_caller_active_member() THEN
    RAISE EXCEPTION 'Active campus account required to submit abuse reports.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.reporter_id := v_uid;
    NEW.status := 'PENDING';

    IF NEW.reason NOT IN ('spam', 'inappropriate', 'fraudulent', 'duplicate', 'other') THEN
      RAISE EXCEPTION 'Invalid report reason.';
    END IF;

    IF NEW.details IS NOT NULL AND length(trim(NEW.details)) > 500 THEN
      RAISE EXCEPTION 'Abuse report details cannot exceed 500 characters.';
    END IF;

    PERFORM public.check_and_record_rate_limit('abuse_report');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT public.is_current_user_admin() THEN
      RAISE EXCEPTION 'Only administrators can review moderation reports.';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_moderation_report_rules ON public.moderation_reports;
CREATE TRIGGER trg_enforce_moderation_report_rules
  BEFORE INSERT OR UPDATE ON public.moderation_reports
  FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_moderation_report_rules();

REVOKE ALL ON FUNCTION public.trg_enforce_moderation_report_rules() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- Direct API Bypass Defenses: Claim State Machine Guard Trigger
-- -----------------------------------------------------------------------------
-- Strictly controls claim state transitions:
--   Claimant: can only withdraw (REQUESTED/UNDER_REVIEW -> WITHDRAWN)
--   Desk/Admin: can review/approve (REQUESTED -> UNDER_REVIEW -> APPROVED_FOR_HANDOVER -> REJECTED)
--   HANDED_OVER and RESOLVED are strictly reserved for complete_handover_resolution
CREATE OR REPLACE FUNCTION public.trg_enforce_claim_state_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_is_desk BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Authentication required.';
    END IF;
    RETURN NEW;
  END IF;

  v_is_desk := public.is_current_user_desk_operator();

  IF TG_OP = 'INSERT' THEN
    -- Direct inserts must originate from authenticated active member
    IF NOT public.is_caller_active_member() THEN
      RAISE EXCEPTION 'Active campus account required to submit claims.';
    END IF;

    NEW.claimant_id := v_uid;
    -- Initial status can only be REQUESTED or DISPUTED (never APPROVED or RESOLVED)
    IF NEW.status NOT IN ('REQUESTED', 'DISPUTED') THEN
      NEW.status := 'REQUESTED';
    END IF;

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Check terminal states: once resolved, rejected, or withdrawn, claim cannot be changed
    IF OLD.status IN ('RESOLVED', 'REJECTED', 'WITHDRAWN') THEN
      RAISE EXCEPTION 'Cannot modify claim: Claim is in terminal state (%).', OLD.status;
    END IF;

    -- If caller is claimant (and not desk operator/admin)
    IF NOT v_is_desk THEN
      IF OLD.claimant_id <> v_uid THEN
        RAISE EXCEPTION 'Permission denied: You can only modify your own claims.';
      END IF;

      -- Claimant can ONLY transition to WITHDRAWN
      IF NEW.status <> 'WITHDRAWN' THEN
        RAISE EXCEPTION 'Claimants can only withdraw their claims; they cannot alter status or review fields.';
      END IF;

      IF OLD.status NOT IN ('REQUESTED', 'UNDER_REVIEW') THEN
        RAISE EXCEPTION 'Claim cannot be withdrawn in its current status (%).', OLD.status;
      END IF;

      -- Prevent tampering with evidence or review fields
      NEW.claim_evidence := OLD.claim_evidence;
      NEW.found_report_id := OLD.found_report_id;
      NEW.linked_lost_report_id := OLD.linked_lost_report_id;
      NEW.review_notes := OLD.review_notes;
      NEW.reviewed_by := OLD.reviewed_by;
      NEW.reviewed_at := OLD.reviewed_at;
    ELSE
      -- Desk operator / Administrator transitions
      -- Prevent transitioning directly to RESOLVED without complete_handover_resolution
      IF NEW.status = 'RESOLVED' AND coalesce(current_setting('lostlink.in_handover_rpc', true), 'false') <> 'true' THEN
        RAISE EXCEPTION 'Claims can only be resolved through complete_handover_resolution physical handover procedure.';
      END IF;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_claim_state_rules ON public.claims;
CREATE TRIGGER trg_enforce_claim_state_rules
  BEFORE INSERT OR UPDATE ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_claim_state_rules();

REVOKE ALL ON FUNCTION public.trg_enforce_claim_state_rules() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- Revoke Direct Mutation Privileges from Authenticated Role
-- -----------------------------------------------------------------------------
-- Force sensitive operations through secure RPCs and prevent direct PostgREST tampering:
REVOKE INSERT, UPDATE, DELETE ON public.claims FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.handover_records FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.campus_memberships FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.staff_allowlist FROM authenticated;
REVOKE UPDATE, DELETE ON public.moderation_reports FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.rate_limit_events FROM authenticated;

-- Read privileges granted (filtered strictly by RLS policies below)
GRANT SELECT ON public.campus_memberships TO authenticated;
GRANT SELECT ON public.staff_allowlist TO authenticated;
GRANT SELECT ON public.campus_desks TO authenticated;
GRANT SELECT ON public.claims TO authenticated;
GRANT SELECT ON public.handover_records TO authenticated;
GRANT SELECT ON public.report_private_details TO authenticated;
GRANT SELECT ON public.rate_limit_events TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.moderation_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;

-- -----------------------------------------------------------------------------
-- RLS Policies (Universal Active Membership Enforcement)
-- -----------------------------------------------------------------------------

-- 1. campus_memberships:
DROP POLICY IF EXISTS "Users can view own membership" ON public.campus_memberships;
CREATE POLICY "Users can view own membership"
  ON public.campus_memberships FOR SELECT TO authenticated
  USING (
    -- Only active members can view their membership; desk operators and admins can view all
    (auth.uid() = user_id AND status = 'ACTIVE') OR public.is_current_user_desk_operator()
  );

DROP POLICY IF EXISTS "Admins manage memberships" ON public.campus_memberships;
CREATE POLICY "Admins manage memberships"
  ON public.campus_memberships FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- 2. staff_allowlist:
DROP POLICY IF EXISTS "Admins manage staff allowlist" ON public.staff_allowlist;
CREATE POLICY "Admins manage staff allowlist"
  ON public.staff_allowlist FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- 3. campus_desks:
DROP POLICY IF EXISTS "Campus desks are viewable by authenticated users" ON public.campus_desks;
CREATE POLICY "Campus desks are viewable by authenticated users"
  ON public.campus_desks FOR SELECT TO authenticated
  USING (public.is_caller_active_member());

DROP POLICY IF EXISTS "Admins manage campus desks" ON public.campus_desks;
CREATE POLICY "Admins manage campus desks"
  ON public.campus_desks FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- 4. report_private_details:
DROP POLICY IF EXISTS "Owner or desk can view private report details" ON public.report_private_details;
CREATE POLICY "Owner or desk can view private report details"
  ON public.report_private_details FOR SELECT TO authenticated
  USING (
    public.is_caller_active_member() AND (auth.uid() = owner_id OR public.is_current_user_desk_operator())
  );

DROP POLICY IF EXISTS "Owners can manage private details" ON public.report_private_details;
CREATE POLICY "Owners can manage private details"
  ON public.report_private_details FOR ALL TO authenticated
  USING (public.is_caller_active_member() AND auth.uid() = owner_id)
  WITH CHECK (public.is_caller_active_member() AND auth.uid() = owner_id);

-- 5. claims:
DROP POLICY IF EXISTS "Claimants can view own claims" ON public.claims;
CREATE POLICY "Claimants can view own claims"
  ON public.claims FOR SELECT TO authenticated
  USING (
    public.is_caller_active_member() AND (auth.uid() = claimant_id OR public.is_current_user_desk_operator())
  );

-- 6. handover_records:
DROP POLICY IF EXISTS "Claimants can view own handover records" ON public.handover_records;
CREATE POLICY "Claimants can view own handover records"
  ON public.handover_records FOR SELECT TO authenticated
  USING (
    public.is_caller_active_member() AND (auth.uid() = claimant_id OR public.is_current_user_desk_operator())
  );

-- 7. audit_logs:
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

-- 8. moderation_reports:
DROP POLICY IF EXISTS "Reporters view own abuse reports" ON public.moderation_reports;
CREATE POLICY "Reporters view own abuse reports"
  ON public.moderation_reports FOR SELECT TO authenticated
  USING (
    public.is_caller_active_member() AND (auth.uid() = reporter_id OR public.is_current_user_admin())
  );

DROP POLICY IF EXISTS "Active users can insert abuse reports" ON public.moderation_reports;
CREATE POLICY "Active users can insert abuse reports"
  ON public.moderation_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id AND public.is_caller_active_member());

-- 9. rate_limit_events:
DROP POLICY IF EXISTS "Users can view own rate limit events" ON public.rate_limit_events;
CREATE POLICY "Users can view own rate limit events"
  ON public.rate_limit_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Ensure baseline permissive report write policies exist if not already defined
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reports' AND policyname = 'Users can create their own reports'
  ) THEN
    CREATE POLICY "Users can create their own reports"
      ON public.reports
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reports' AND policyname = 'Users can update their own reports'
  ) THEN
    CREATE POLICY "Users can update their own reports"
      ON public.reports
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 10. Universal Restrictive Policies on reports:
DROP POLICY IF EXISTS "Active membership required for report reads" ON public.reports;
CREATE POLICY "Active membership required for report reads"
  ON public.reports AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.is_caller_active_member());

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

-- -----------------------------------------------------------------------------
-- Signup Enforcement Trigger: Student PRN, Staff Allowlist, Admin Protection
-- -----------------------------------------------------------------------------
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

  -- 3. Staff & Faculty Allowlist check (never infer staff from user_metadata)
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
-- Synchronize Campus Memberships on User Signup (Staff Check via Allowlist Only)
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
  v_staff_role text;
  v_normalized_email text;
BEGIN
  v_normalized_email := lower(btrim(coalesce(NEW.email, '')));

  -- 1. Administrator: ONLY trusted raw_app_meta_data
  IF NEW.raw_app_meta_data IS NOT NULL AND NEW.raw_app_meta_data ->> 'role' = 'admin' THEN
    v_role := 'admin';
    v_status := 'ACTIVE';
  ELSE
    -- 2. Staff: check public.staff_allowlist (NEVER user_metadata)
    SELECT role INTO v_staff_role
    FROM public.staff_allowlist
    WHERE email = v_normalized_email AND is_active = true;

    IF FOUND THEN
      v_role := coalesce(v_staff_role, 'staff');
      v_status := 'ACTIVE';
    ELSE
      -- 3. Student (enforce_college_email_domain already verified numeric PRN format)
      v_role := 'student';
      v_status := 'ACTIVE';
    END IF;
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

-- Backfill memberships for any existing auth.users without one (strictly ignoring user_metadata)
INSERT INTO public.campus_memberships (user_id, membership_type, status, approved_at)
SELECT
  u.id,
  CASE
    WHEN u.raw_app_meta_data ->> 'role' = 'admin' THEN 'admin'
    WHEN EXISTS (
      SELECT 1 FROM public.staff_allowlist sa
      WHERE sa.email = lower(btrim(coalesce(u.email, ''))) AND sa.is_active = true
    ) THEN 'staff'
    ELSE 'student'
  END,
  'ACTIVE',
  now()
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Server-Side Procedures: Report Creation, Claims, Review & Handover
-- -----------------------------------------------------------------------------

-- Procedure: Secure Report Creation (Supports both p_image_path and legacy p_image_url)
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
  p_image_path TEXT DEFAULT NULL,
  p_private_evidence TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_report_id UUID;
  v_effective_image TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT public.is_caller_active_member() THEN
    RAISE EXCEPTION 'Your campus account is not active. Please contact administrator.';
  END IF;

  IF p_private_evidence IS NOT NULL AND length(trim(p_private_evidence)) > 300 THEN
    RAISE EXCEPTION 'Private evidence detail cannot exceed 300 characters.';
  END IF;

  v_effective_image := COALESCE(p_image_path, p_image_url);

  -- Insert report (trg_enforce_report_mutation_rules validates title, desc, word count, location, quotas)
  INSERT INTO public.reports (
    user_id, type, title, category, description, location, date,
    brand_model, color, distinguishing_features, campus_zone,
    custody_status, image_url, status, has_private_verification
  )
  VALUES (
    v_uid, p_type, trim(p_title), p_category, trim(p_description), trim(p_location), p_date,
    nullif(trim(p_brand_model), ''), nullif(trim(p_color), ''), nullif(trim(p_distinguishing_features), ''),
    nullif(trim(p_campus_zone), ''), p_custody_status, v_effective_image, p_type,
    (p_private_evidence IS NOT NULL AND length(trim(p_private_evidence)) >= 3)
  )
  RETURNING id INTO v_report_id;

  -- Insert private identifying evidence if provided (strictly restricted)
  IF p_private_evidence IS NOT NULL AND length(trim(p_private_evidence)) >= 3 THEN
    INSERT INTO public.report_private_details (report_id, owner_id, private_detail)
    VALUES (v_report_id, v_uid, trim(p_private_evidence));
  END IF;

  -- Log audit event
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (v_uid, 'REPORT_CREATED', 'report', v_report_id, jsonb_build_object('type', p_type, 'title', p_title));

  RETURN v_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_report_secure FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_report_secure TO authenticated;

-- Procedure: Authorized Report Self-Resolution (Owner)
CREATE OR REPLACE FUNCTION public.resolve_report(report_id UUID)
RETURNS public.reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_report public.reports%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT public.is_caller_active_member() THEN
    RAISE EXCEPTION 'Active campus account required.';
  END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found.';
  END IF;

  IF v_report.user_id <> v_uid AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Permission denied: You can only resolve your own reports.';
  END IF;

  IF v_report.status = 'resolved' THEN
    RETURN v_report;
  END IF;

  -- Set session flag so report mutation trigger allows resolution from this RPC
  PERFORM set_config('lostlink.in_resolve_rpc', 'true', true);

  UPDATE public.reports
  SET status = 'resolved', updated_at = now()
  WHERE id = report_id
  RETURNING * INTO v_report;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (v_uid, 'REPORT_RESOLVED_BY_OWNER', 'report', report_id, jsonb_build_object('title', v_report.title));

  RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_report(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_report(UUID) TO authenticated;

-- Procedure: Secure Claim Submission
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

  IF v_found_report.type <> 'found' THEN
    RAISE EXCEPTION 'Claims can only be filed against found item reports.';
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

  -- Concurrency-safe rate limit check (max 5 claims per day)
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

-- Procedure: Secure Claim Withdrawal (Claimant)
CREATE OR REPLACE FUNCTION public.withdraw_claim_secure(p_claim_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_claim public.claims%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_claim FROM public.claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim record not found.';
  END IF;

  IF v_claim.claimant_id <> v_uid AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Permission denied: You can only withdraw your own claims.';
  END IF;

  IF v_claim.status NOT IN ('REQUESTED', 'UNDER_REVIEW', 'DISPUTED') THEN
    RAISE EXCEPTION 'Cannot withdraw claim in its current status (%).', v_claim.status;
  END IF;

  UPDATE public.claims
  SET status = 'WITHDRAWN', updated_at = now()
  WHERE id = p_claim_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (v_uid, 'CLAIM_WITHDRAWN', 'claim', p_claim_id, jsonb_build_object('found_report_id', v_claim.found_report_id));

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_claim_secure(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_claim_secure(UUID) TO authenticated;

-- Procedure: Review & Update Claim Status (Desk Operator / Administrator)
CREATE OR REPLACE FUNCTION public.review_claim_status(
  p_claim_id UUID,
  p_new_status TEXT,
  p_review_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_claim public.claims%ROWTYPE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT public.is_current_user_desk_operator() THEN
    RAISE EXCEPTION 'Permission denied: Only authorized desk operators or administrators can review claims.';
  END IF;

  IF NOT public.is_caller_active_member() THEN
    RAISE EXCEPTION 'Operator membership is inactive or revoked.';
  END IF;

  IF p_new_status NOT IN ('UNDER_REVIEW', 'APPROVED_FOR_HANDOVER', 'REJECTED', 'DISPUTED') THEN
    RAISE EXCEPTION 'Invalid review status transition. Status RESOLVED is reserved for complete_handover_resolution.';
  END IF;

  SELECT * INTO v_claim FROM public.claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim record not found.';
  END IF;

  IF v_claim.status IN ('RESOLVED', 'REJECTED', 'WITHDRAWN') THEN
    RAISE EXCEPTION 'Cannot update claim: Claim is in terminal state (%).', v_claim.status;
  END IF;

  -- If approving this claim for handover, reject or dispute competing claims
  IF p_new_status = 'APPROVED_FOR_HANDOVER' THEN
    UPDATE public.claims
    SET status = 'REJECTED',
        review_notes = 'Another claimant was verified as the genuine owner.',
        reviewed_by = v_caller_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE found_report_id = v_claim.found_report_id
      AND id <> p_claim_id
      AND status NOT IN ('RESOLVED', 'REJECTED');
  END IF;

  UPDATE public.claims
  SET status = p_new_status,
      review_notes = coalesce(p_review_notes, review_notes),
      reviewed_by = v_caller_id,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_claim_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_caller_id,
    'CLAIM_REVIEW_UPDATED',
    'claim',
    p_claim_id,
    jsonb_build_object(
      'old_status', v_claim.status,
      'new_status', p_new_status,
      'notes', p_review_notes
    )
  );

  RETURN jsonb_build_object('success', true, 'claim_id', p_claim_id, 'status', p_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.review_claim_status(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_claim_status(UUID, TEXT, TEXT) TO authenticated;

-- Procedure: Complete Handover & Resolution (Physical Custody Transfer)
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
  v_lost_report public.reports;
  v_handover_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT public.is_current_user_desk_operator() THEN
    RAISE EXCEPTION 'Permission denied: Only authorized desk operators or administrators can authorize physical handovers.';
  END IF;

  IF NOT public.is_caller_active_member() THEN
    RAISE EXCEPTION 'Operator membership is inactive or revoked.';
  END IF;

  IF NOT p_id_verified THEN
    RAISE EXCEPTION 'Student identity and PRN must be physically verified prior to authorizing item handover.';
  END IF;

  IF length(trim(coalesce(p_condition_notes, ''))) < 3 THEN
    RAISE EXCEPTION 'Item condition notes are required (minimum 3 characters).';
  END IF;

  -- 1. Fetch and Lock Claim
  SELECT * INTO v_claim FROM public.claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim record not found.';
  END IF;

  -- Strict status eligibility checks:
  IF v_claim.status = 'REQUESTED' THEN
    RAISE EXCEPTION 'Claim has not been reviewed yet. It must be approved for handover first.';
  ELSIF v_claim.status = 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'Claim is still under review and has not yet been approved for handover.';
  ELSIF v_claim.status = 'DISPUTED' THEN
    RAISE EXCEPTION 'Cannot complete handover: Claim is disputed. Resolve competing claims first.';
  ELSIF v_claim.status IN ('REJECTED', 'WITHDRAWN') THEN
    RAISE EXCEPTION 'Cannot complete handover for rejected or withdrawn claim.';
  ELSIF v_claim.status IN ('HANDED_OVER', 'RESOLVED') THEN
    RAISE EXCEPTION 'Handover has already been completed for this claim.';
  ELSIF v_claim.status <> 'APPROVED_FOR_HANDOVER' THEN
    RAISE EXCEPTION 'Only claims explicitly in APPROVED_FOR_HANDOVER status can be handed over.';
  END IF;

  -- 2. Fetch and Lock Found Report
  SELECT * INTO v_found_report FROM public.reports WHERE id = v_claim.found_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated found report not found.';
  END IF;

  IF v_found_report.type <> 'found' THEN
    RAISE EXCEPTION 'Associated report is not a found item report.';
  END IF;

  IF v_found_report.status = 'resolved' THEN
    RAISE EXCEPTION 'Found item report is already marked resolved.';
  END IF;

  -- Prevent duplicate handovers on the same found item
  IF EXISTS (
    SELECT 1 FROM public.handover_records
    WHERE found_report_id = v_found_report.id AND handover_status = 'COMPLETED'
  ) THEN
    RAISE EXCEPTION 'Duplicate handover blocked: A completed handover record already exists for this found item.';
  END IF;

  -- 3. Validate Linked Lost Report (if attached)
  IF v_claim.linked_lost_report_id IS NOT NULL THEN
    SELECT * INTO v_lost_report FROM public.reports WHERE id = v_claim.linked_lost_report_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked lost report not found.';
    END IF;

    IF v_lost_report.type <> 'lost' THEN
      RAISE EXCEPTION 'Linked report must be of type lost.';
    END IF;

    IF v_lost_report.user_id <> v_claim.claimant_id THEN
      RAISE EXCEPTION 'Linked lost report does not belong to the verified claimant.';
    END IF;

    IF v_lost_report.status = 'resolved' THEN
      RAISE EXCEPTION 'Linked lost report is already resolved.';
    END IF;
  END IF;

  -- Set session flag so claim/report mutation triggers allow status transition to RESOLVED
  PERFORM set_config('lostlink.in_handover_rpc', 'true', true);

  -- 4. Create Immutable Handover Record
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

  -- 5. Transition Claim status to RESOLVED
  UPDATE public.claims
  SET status = 'RESOLVED',
      reviewed_by = v_caller_id,
      reviewed_at = now(),
      review_notes = coalesce(review_notes || E'\n', '') || 'Physical handover confirmed by operator at desk.',
      updated_at = now()
  WHERE id = p_claim_id;

  -- 6. Resolve Found Report
  UPDATE public.reports
  SET status = 'resolved',
      custody_status = 'desk_custody_confirmed',
      updated_at = now()
  WHERE id = v_claim.found_report_id;

  -- 7. If claimant linked their lost report, resolve that too
  IF v_claim.linked_lost_report_id IS NOT NULL THEN
    UPDATE public.reports
    SET status = 'resolved',
        updated_at = now()
    WHERE id = v_claim.linked_lost_report_id;
  END IF;

  -- 8. Reject any remaining competing claims
  UPDATE public.claims
  SET status = 'REJECTED',
      review_notes = 'Item resolved and returned to verified claimant via campus helpdesk.',
      reviewed_by = v_caller_id,
      reviewed_at = now(),
      updated_at = now()
  WHERE found_report_id = v_claim.found_report_id
    AND id <> p_claim_id
    AND status NOT IN ('RESOLVED', 'REJECTED');

  -- 9. Notify claimant
  INSERT INTO public.notifications (user_id, title, message, link, read)
  VALUES (
    v_claim.claimant_id,
    'Item Handover Completed',
    'Your claim for "' || v_found_report.title || '" has been verified and physical handover is complete. The item is resolved.',
    '/my-reports',
    false
  );

  -- 10. Audit log
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

-- =============================================================================
-- 15. Server-Side Administrative Management RPCs
-- =============================================================================

-- 1. Pre-approve / add staff to allowlist
CREATE OR REPLACE FUNCTION public.admin_add_staff_allowlist(
  p_email TEXT,
  p_name TEXT,
  p_department TEXT DEFAULT 'General',
  p_role TEXT DEFAULT 'staff'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_normalized_email TEXT;
  v_entry_id UUID;
BEGIN
  IF NOT public.can_access_admin_portal() THEN
    RAISE EXCEPTION 'Access denied: Authoritative administrator privileges required.';
  END IF;

  v_caller_id := auth.uid();
  v_normalized_email := lower(btrim(coalesce(p_email, '')));

  IF v_normalized_email = '' OR v_normalized_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'A valid email address is required.';
  END IF;

  IF btrim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Staff name is required.';
  END IF;

  IF p_role NOT IN ('staff', 'desk_operator') THEN
    RAISE EXCEPTION 'Invalid staff role: must be staff or desk_operator.';
  END IF;

  INSERT INTO public.staff_allowlist (email, name, department, role, is_active, created_by)
  VALUES (v_normalized_email, btrim(p_name), btrim(coalesce(p_department, 'General')), p_role, true, v_caller_id)
  ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    department = EXCLUDED.department,
    role = EXCLUDED.role,
    is_active = true,
    updated_at = now()
  RETURNING id INTO v_entry_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_caller_id,
    'STAFF_ALLOWLIST_UPSERTED',
    'staff_allowlist',
    v_entry_id,
    jsonb_build_object('email', v_normalized_email, 'name', p_name, 'role', p_role)
  );

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_staff_allowlist(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_staff_allowlist(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 2. Toggle active state of staff allowlist entry
CREATE OR REPLACE FUNCTION public.admin_toggle_staff_allowlist(
  p_id UUID,
  p_is_active BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_entry public.staff_allowlist%ROWTYPE;
BEGIN
  IF NOT public.can_access_admin_portal() THEN
    RAISE EXCEPTION 'Access denied: Authoritative administrator privileges required.';
  END IF;

  v_caller_id := auth.uid();

  SELECT * INTO v_entry FROM public.staff_allowlist WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff allowlist entry not found.';
  END IF;

  UPDATE public.staff_allowlist
  SET is_active = p_is_active, updated_at = now()
  WHERE id = p_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_caller_id,
    'STAFF_ALLOWLIST_STATUS_CHANGED',
    'staff_allowlist',
    p_id,
    jsonb_build_object('email', v_entry.email, 'is_active', p_is_active)
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_toggle_staff_allowlist(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_toggle_staff_allowlist(UUID, BOOLEAN) TO authenticated;

-- 3. Suspend or reactivate campus membership
CREATE OR REPLACE FUNCTION public.admin_set_membership_status(
  p_user_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_mem public.campus_memberships%ROWTYPE;
BEGIN
  IF NOT public.can_access_admin_portal() THEN
    RAISE EXCEPTION 'Access denied: Authoritative administrator privileges required.';
  END IF;

  v_caller_id := auth.uid();

  IF p_status NOT IN ('ACTIVE', 'SUSPENDED', 'REVOKED', 'PENDING') THEN
    RAISE EXCEPTION 'Invalid membership status: must be ACTIVE, SUSPENDED, REVOKED, or PENDING.';
  END IF;

  IF p_user_id = v_caller_id AND p_status IN ('SUSPENDED', 'REVOKED') THEN
    RAISE EXCEPTION 'Cannot suspend or revoke your own active administrator account.';
  END IF;

  SELECT * INTO v_mem FROM public.campus_memberships WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campus membership not found for user.';
  END IF;

  UPDATE public.campus_memberships
  SET status = p_status,
      notes = coalesce(p_notes, notes),
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_caller_id,
    'MEMBERSHIP_STATUS_UPDATED',
    'campus_membership',
    p_user_id,
    jsonb_build_object('previous_status', v_mem.status, 'new_status', p_status, 'notes', p_notes)
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_membership_status(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_membership_status(UUID, TEXT, TEXT) TO authenticated;

-- 4. Grant or revoke desk-operator role on campus membership
CREATE OR REPLACE FUNCTION public.admin_set_membership_role(
  p_user_id UUID,
  p_role TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_mem public.campus_memberships%ROWTYPE;
BEGIN
  IF NOT public.can_access_admin_portal() THEN
    RAISE EXCEPTION 'Access denied: Authoritative administrator privileges required.';
  END IF;

  v_caller_id := auth.uid();

  IF p_role NOT IN ('student', 'staff', 'desk_operator') THEN
    RAISE EXCEPTION 'Invalid role assignment: must be student, staff, or desk_operator.';
  END IF;

  IF p_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Cannot alter primary administrator role assignment.';
  END IF;

  SELECT * INTO v_mem FROM public.campus_memberships WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campus membership not found for user.';
  END IF;

  -- Admin role cannot be modified through this endpoint
  IF v_mem.membership_type = 'admin' THEN
    RAISE EXCEPTION 'Cannot modify administrator role assignment through this endpoint.';
  END IF;

  UPDATE public.campus_memberships
  SET membership_type = p_role,
      notes = coalesce(p_notes, notes),
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_caller_id,
    'MEMBERSHIP_ROLE_UPDATED',
    'campus_membership',
    p_user_id,
    jsonb_build_object('previous_role', v_mem.membership_type, 'new_role', p_role, 'notes', p_notes)
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_membership_role(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_membership_role(UUID, TEXT, TEXT) TO authenticated;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
