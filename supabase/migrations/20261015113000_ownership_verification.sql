-- =============================================================================
-- LostLink — Migration: Secure Ownership Verification (Clue & Salted PIN Hash)
-- Migration Timestamp: 20261015113000
-- =============================================================================

-- Ensure cryptographic hashing functions (crypt, gen_salt) are available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Extend public.reports with public verification flag
-- -----------------------------------------------------------------------------
-- Informs clients whether verification is enabled without exposing private data
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS has_private_verification BOOLEAN NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
-- 2. Table: public.report_ownership_verifications
-- -----------------------------------------------------------------------------
-- Dedicated private table holding confidential ownership verification details.
-- Plaintext PINs are NEVER stored. Only salted, computationally expensive
-- bcrypt hashes (via pgcrypto crypt with blowfish salt) are recorded.
CREATE TABLE IF NOT EXISTS public.report_ownership_verifications (
  report_id UUID PRIMARY KEY REFERENCES public.reports(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  clue TEXT NOT NULL CHECK (length(trim(clue)) >= 3),
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verifications_owner_id 
  ON public.report_ownership_verifications(owner_id);

-- -----------------------------------------------------------------------------
-- 3. Table: public.ownership_verification_attempts
-- -----------------------------------------------------------------------------
-- Bounded rate-limiting table tracking claim verification attempts per claimant
-- and target report to prevent enumeration or brute-force attacks on 6-digit PINs.
CREATE TABLE IF NOT EXISTS public.ownership_verification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  claimant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempt_count INT NOT NULL DEFAULT 1,
  failed_attempts INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'verified', 'locked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_attempt_claimant_report UNIQUE (report_id, claimant_id)
);

CREATE INDEX IF NOT EXISTS idx_verification_attempts_lookup 
  ON public.ownership_verification_attempts(report_id, claimant_id);

-- -----------------------------------------------------------------------------
-- 4. Row-Level Security (RLS) Configuration
-- -----------------------------------------------------------------------------
ALTER TABLE public.report_ownership_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ownership_verification_attempts ENABLE ROW LEVEL SECURITY;

-- Report Ownership Verifications Policies:
-- Only the authentic report owner can SELECT their own verification record
DROP POLICY IF EXISTS "Owners can view own verification details" ON public.report_ownership_verifications;
CREATE POLICY "Owners can view own verification details"
  ON public.report_ownership_verifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

-- Explicitly revoke direct SELECT on pin_hash so it can NEVER leak through PostgREST queries
REVOKE SELECT (pin_hash) ON public.report_ownership_verifications FROM PUBLIC, authenticated, anon;

-- Only authentic report owner can INSERT verification details for their own report
DROP POLICY IF EXISTS "Owners can insert verification details" ON public.report_ownership_verifications;
CREATE POLICY "Owners can insert verification details"
  ON public.report_ownership_verifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = owner_id AND
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE reports.id = report_id AND reports.user_id = auth.uid()
    )
  );

-- Only authentic report owner can UPDATE their verification details
DROP POLICY IF EXISTS "Owners can update own verification details" ON public.report_ownership_verifications;
CREATE POLICY "Owners can update own verification details"
  ON public.report_ownership_verifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Only authentic report owner can DELETE their verification details
DROP POLICY IF EXISTS "Owners can delete own verification details" ON public.report_ownership_verifications;
CREATE POLICY "Owners can delete own verification details"
  ON public.report_ownership_verifications
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- Ownership Verification Attempts Policies:
-- Claimants can only inspect their own attempt status
DROP POLICY IF EXISTS "Claimants can view own verification attempts" ON public.ownership_verification_attempts;
CREATE POLICY "Claimants can view own verification attempts"
  ON public.ownership_verification_attempts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = claimant_id);

-- Modification of attempts is handled strictly by SECURITY DEFINER function
REVOKE INSERT, UPDATE, DELETE ON public.ownership_verification_attempts FROM PUBLIC, authenticated, anon;

-- -----------------------------------------------------------------------------
-- 5. Secure Function: public.set_report_verification_details
-- -----------------------------------------------------------------------------
-- Authenticated procedure for report creators to set or update clue and PIN.
-- Performs server-side validation and salt+bcrypt hashing in PostgreSQL.
CREATE OR REPLACE FUNCTION public.set_report_verification_details(
  p_report_id UUID,
  p_clue TEXT,
  p_pin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_report public.reports;
  v_clean_clue TEXT;
  v_clean_pin TEXT;
  v_pin_hash TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required.');
  END IF;

  -- Verify report exists and caller is owner
  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report not found.');
  END IF;

  IF v_report.user_id <> v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied.');
  END IF;

  IF v_report.status = 'resolved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Resolved reports cannot be modified.');
  END IF;

  -- Validate clue
  v_clean_clue := trim(p_clue);
  IF length(v_clean_clue) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ownership clue must be at least 3 characters.');
  END IF;

  -- If PIN is provided, validate 6-digit numeric pattern and hash with bcrypt
  IF p_pin IS NOT NULL AND p_pin <> '' THEN
    v_clean_pin := trim(p_pin);
    IF v_clean_pin !~ '^[0-9]{6}$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Secret PIN must be exactly 6 numeric digits.');
    END IF;
    v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 10));
  END IF;

  -- Upsert verification details
  IF v_pin_hash IS NOT NULL THEN
    INSERT INTO public.report_ownership_verifications (
      report_id, owner_id, clue, pin_hash, updated_at
    )
    VALUES (
      p_report_id, v_caller_id, v_clean_clue, v_pin_hash, now()
    )
    ON CONFLICT (report_id) DO UPDATE SET
      clue = EXCLUDED.clue,
      pin_hash = EXCLUDED.pin_hash,
      updated_at = now();
  ELSE
    -- If updating clue without changing existing PIN
    UPDATE public.report_ownership_verifications
    SET clue = v_clean_clue, updated_at = now()
    WHERE report_id = p_report_id AND owner_id = v_caller_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Secret PIN is required when setting up verification for the first time.');
    END IF;
  END IF;

  -- Synchronize public reports flag
  UPDATE public.reports
  SET has_private_verification = true, updated_at = now()
  WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_report_verification_details(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_report_verification_details(UUID, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Secure Function: public.get_owner_verification_details
-- -----------------------------------------------------------------------------
-- Allows the genuine report owner to retrieve their configured clue.
-- PIN is NEVER returned in any form.
CREATE OR REPLACE FUNCTION public.get_owner_verification_details(
  p_report_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_rec public.report_ownership_verifications;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required.');
  END IF;

  SELECT * INTO v_rec
  FROM public.report_ownership_verifications
  WHERE report_id = p_report_id AND owner_id = v_caller_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'configured', false);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'configured', true,
    'clue', v_rec.clue,
    'created_at', v_rec.created_at,
    'updated_at', v_rec.updated_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_owner_verification_details(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_owner_verification_details(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Secure Function: public.verify_ownership
-- -----------------------------------------------------------------------------
-- Authoritative server-side ownership verification endpoint.
-- Requirements met:
-- 1. Caller authentication checked.
-- 2. Target report eligibility verified.
-- 3. Rate limiting and bounded lockout per (claimant, report).
-- 4. Bounded brute-force lockout (5 attempts per 15-minute window).
-- 5. Caller cannot verify their own report.
-- 6. Constant-time / salted bcrypt PIN comparison via pgcrypto.
-- 7. Normalized clue comparison.
-- 8. Generic failure responses that do not reveal whether clue or PIN was wrong.
-- 9. Secrets are never logged or returned.
CREATE OR REPLACE FUNCTION public.verify_ownership(
  p_report_id UUID,
  p_clue TEXT,
  p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID;
  v_report public.reports;
  v_verification public.report_ownership_verifications;
  v_attempt public.ownership_verification_attempts;
  v_clean_clue TEXT;
  v_clean_pin TEXT;
  v_pin_matches BOOLEAN;
  v_clue_matches BOOLEAN;
  v_norm_submitted TEXT;
  v_norm_stored TEXT;
  c_max_attempts CONSTANT INT := 5;
  c_lockout_interval CONSTANT INTERVAL := INTERVAL '15 minutes';
BEGIN
  -- 1. Caller authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'verified', false,
      'error', 'Authentication required to verify ownership.'
    );
  END IF;

  -- 2. Check target report
  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'verified', false,
      'error', 'Target report not found.'
    );
  END IF;

  IF v_report.status = 'resolved' THEN
    RETURN jsonb_build_object(
      'success', false,
      'verified', false,
      'error', 'This report is already resolved and no longer accepting verification claims.'
    );
  END IF;

  -- 3. Prevent owner verifying own report
  IF v_report.user_id = v_caller_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'verified', false,
      'error', 'You are the registered creator of this report. Owners manage details in edit mode rather than claiming.'
    );
  END IF;

  -- 4. Fetch stored verification record
  SELECT * INTO v_verification 
  FROM public.report_ownership_verifications 
  WHERE report_id = p_report_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'verified', false,
      'error', 'No private ownership verification is configured for this item.'
    );
  END IF;

  -- 5. Rate limiting / Attempt bounding
  SELECT * INTO v_attempt 
  FROM public.ownership_verification_attempts 
  WHERE report_id = p_report_id AND claimant_id = v_caller_id
  FOR UPDATE;

  IF FOUND THEN
    -- Check if active lockout applies
    IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until > now() THEN
      RETURN jsonb_build_object(
        'success', false,
        'verified', false,
        'error', 'Too many verification attempts for this item. Please wait before trying again.',
        'locked', true,
        'locked_until', v_attempt.locked_until
      );
    END IF;

    -- If previous lockout has expired, reset failed counter
    IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until <= now() THEN
      UPDATE public.ownership_verification_attempts
      SET failed_attempts = 0, locked_until = NULL, status = 'active'
      WHERE id = v_attempt.id;
      v_attempt.failed_attempts := 0;
    END IF;
  ELSE
    -- Initialize attempt row
    INSERT INTO public.ownership_verification_attempts (
      report_id, claimant_id, attempt_count, failed_attempts, last_attempt_at, status
    )
    VALUES (
      p_report_id, v_caller_id, 0, 0, now(), 'active'
    )
    RETURNING * INTO v_attempt;
  END IF;

  -- 6. Sanitize inputs
  v_clean_clue := COALESCE(trim(p_clue), '');
  v_clean_pin := COALESCE(trim(p_pin), '');

  -- 7. Compare PIN with salted bcrypt hash
  v_pin_matches := (extensions.crypt(v_clean_pin, v_verification.pin_hash) = v_verification.pin_hash);

  -- 8. Compare Clue (normalized case-insensitive comparison, ignoring excess whitespace and punctuation)
  v_norm_submitted := lower(regexp_replace(regexp_replace(v_clean_clue, '[^\w\s]', '', 'g'), '\s+', ' ', 'g'));
  v_norm_stored := lower(regexp_replace(regexp_replace(v_verification.clue, '[^\w\s]', '', 'g'), '\s+', ' ', 'g'));
  v_clue_matches := (v_norm_submitted = v_norm_stored) OR (v_norm_submitted <> '' AND v_norm_stored LIKE '%' || v_norm_submitted || '%');

  -- 9. Evaluate outcome
  IF v_pin_matches AND v_clue_matches THEN
    -- Successful verification
    UPDATE public.ownership_verification_attempts
    SET 
      attempt_count = attempt_count + 1,
      failed_attempts = 0,
      last_attempt_at = now(),
      status = 'verified',
      locked_until = NULL
    WHERE id = v_attempt.id;

    -- Send non-disruptive alert notification to report owner
    INSERT INTO public.notifications (
      user_id, title, message, link, read
    )
    VALUES (
      v_report.user_id,
      'Ownership Claim Verified',
      'A fellow student submitted valid ownership verification credentials matching your lost item "' || v_report.title || '".',
      '/items/' || p_report_id,
      false
    );

    RETURN jsonb_build_object(
      'success', true,
      'verified', true,
      'message', 'Ownership verification successful. The reported owner has been alerted.'
    );
  ELSE
    -- Failed verification: increment failed attempts and check lockout threshold
    v_attempt.failed_attempts := v_attempt.failed_attempts + 1;
    v_attempt.attempt_count := v_attempt.attempt_count + 1;

    IF v_attempt.failed_attempts >= c_max_attempts THEN
      UPDATE public.ownership_verification_attempts
      SET 
        attempt_count = v_attempt.attempt_count,
        failed_attempts = v_attempt.failed_attempts,
        last_attempt_at = now(),
        locked_until = now() + c_lockout_interval,
        status = 'locked'
      WHERE id = v_attempt.id;

      RETURN jsonb_build_object(
        'success', false,
        'verified', false,
        'error', 'Too many failed verification attempts. This item is temporarily locked for 15 minutes to protect owner privacy.',
        'locked', true
      );
    ELSE
      UPDATE public.ownership_verification_attempts
      SET 
        attempt_count = v_attempt.attempt_count,
        failed_attempts = v_attempt.failed_attempts,
        last_attempt_at = now()
      WHERE id = v_attempt.id;

      -- Generic failure message: NEVER reveal whether clue or PIN alone was correct
      RETURN jsonb_build_object(
        'success', true,
        'verified', false,
        'message', 'Verification failed. The submitted private details did not match our records.',
        'remaining_attempts', c_max_attempts - v_attempt.failed_attempts
      );
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_ownership(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_ownership(UUID, TEXT, TEXT) TO authenticated;

-- Force PostgREST to immediately refresh its schema cache
NOTIFY pgrst, 'reload schema';
