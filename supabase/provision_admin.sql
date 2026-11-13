-- =============================================================================
-- LostLink — Safe, Idempotent Initial Administrator Provisioning
-- Target Identity: vachannoubade@gmail.com
-- =============================================================================
-- This script must be executed manually by an authorized database administrator
-- in the Supabase SQL editor or direct psql console after security migrations.
--
-- DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT AUTHORIZATION.
--
-- Safety Guarantees:
--   1. Transaction-safe (wrapped in BEGIN / COMMIT).
--   2. Verifies that exactly one targeted auth.users record exists.
--   3. Fails immediately if the account does not exist or target is ambiguous.
--   4. Truly idempotent: repeated executions produce no duplicate audit logs or state changes.
--   5. Preserves existing email confirmation status; does not force-confirm unverified identity.
--   6. Stores admin_provisioned_at as a genuine ISO-8601 timestamp (via to_jsonb(now())).
--   7. Atomically sets raw_app_meta_data.role = 'admin' and ACTIVE campus membership.
--   8. Zero hardcoded passwords, credentials, or public endpoints.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_admin_email CONSTANT TEXT := 'vachannoubade@gmail.com';
  v_user_count INT;
  v_admin_user_id UUID;
  v_email_confirmed BOOLEAN;
  v_already_provisioned BOOLEAN := FALSE;
  v_provision_timestamp TIMESTAMPTZ := now();
BEGIN
  -- 1. Check account existence and ambiguity (must match exactly 1 record)
  SELECT count(*) INTO v_user_count
  FROM auth.users
  WHERE lower(email) = v_admin_email;

  IF v_user_count = 0 THEN
    RAISE EXCEPTION 'PROVISIONING ABORT: Account for % does not exist in auth.users. The administrator must first register or be invited before provisioning.', v_admin_email;
  ELSIF v_user_count > 1 THEN
    RAISE EXCEPTION 'PROVISIONING ABORT: Ambiguous identity: multiple accounts found for %.', v_admin_email;
  END IF;

  -- 2. Fetch authoritative user record
  SELECT id, (email_confirmed_at IS NOT NULL) INTO v_admin_user_id, v_email_confirmed
  FROM auth.users
  WHERE lower(email) = v_admin_email;

  -- 3. Check existing email confirmation status (preserve status without forced verification)
  IF v_email_confirmed THEN
    RAISE NOTICE 'Administrator email status: Confirmed.';
  ELSE
    RAISE NOTICE 'Administrator email status: Unconfirmed (preserved; credentials will be established via invitation / recovery flow).';
  END IF;

  -- 4. Check if administrator is already fully provisioned (for true idempotency)
  SELECT (
    coalesce(u.raw_app_meta_data ->> 'role', '') = 'admin'
    AND u.raw_app_meta_data ? 'admin_provisioned_at'
    AND EXISTS (
      SELECT 1 FROM public.campus_memberships cm
      WHERE cm.user_id = u.id AND cm.membership_type = 'admin' AND cm.status = 'ACTIVE'
    )
  ) INTO v_already_provisioned
  FROM auth.users u
  WHERE u.id = v_admin_user_id;

  IF v_already_provisioned THEN
    RAISE NOTICE 'IDEMPOTENT NO-OP: Administrator % is already fully provisioned with active admin membership. No duplicate audit log created.', v_admin_email;
    RETURN;
  END IF;

  -- 5. Upgrade raw_app_meta_data with trusted role = 'admin' and real ISO timestamp
  UPDATE auth.users
  SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
        'role', 'admin',
        'admin_provisioned_at', to_jsonb(v_provision_timestamp)
      ),
      updated_at = now()
  WHERE id = v_admin_user_id;

  -- 6. Upsert active campus membership atomically
  INSERT INTO public.campus_memberships (
    user_id,
    membership_type,
    status,
    approved_by,
    approved_at,
    expires_at,
    notes
  )
  VALUES (
    v_admin_user_id,
    'admin',
    'ACTIVE',
    v_admin_user_id,
    v_provision_timestamp,
    NULL,
    'Initial authorized administrator explicitly provisioned via secure server script.'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    membership_type = 'admin',
    status = 'ACTIVE',
    expires_at = NULL,
    updated_at = now();

  -- 7. Log immutable audit event
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_admin_user_id,
    'ADMIN_PROVISIONED',
    'campus_membership',
    v_admin_user_id,
    jsonb_build_object(
      'email', v_admin_email,
      'user_id', v_admin_user_id,
      'provisioned_at', v_provision_timestamp
    )
  );

  RAISE NOTICE 'SUCCESS: Initial administrator % successfully provisioned with active admin membership.', v_admin_email;
END $$;

COMMIT;

