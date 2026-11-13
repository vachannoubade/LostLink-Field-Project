-- =============================================================================
-- LostLink — Safe, Idempotent Initial Administrator Provisioning
-- Target Identity: vachannoubade@gmail.com
-- =============================================================================
-- This script must be executed manually by an authorized database administrator
-- in the Supabase SQL editor or direct psql console after security migrations.
--
-- Safety Guarantees:
--   1. Transaction-safe (wrapped in BEGIN / COMMIT).
--   2. Verifies that the targeted auth.users record exists.
--   3. Fails immediately if the account does not exist or target is ambiguous.
--   4. Idempotent: can be executed multiple times safely without duplicate rows.
--   5. Confirms email, sets trusted raw_app_meta_data.role = 'admin', and
--      upserts an ACTIVE administrator campus_memberships record.
--   6. Logs an immutable administrative audit record.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_admin_email CONSTANT TEXT := 'vachannoubade@gmail.com';
  v_user_count INT;
  v_admin_user_id UUID;
  v_email_confirmed BOOLEAN;
BEGIN
  -- 1. Check account existence and ambiguity
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

  -- 3. Confirm email if not already confirmed
  IF NOT v_email_confirmed THEN
    UPDATE auth.users
    SET email_confirmed_at = now(),
        updated_at = now()
    WHERE id = v_admin_user_id;
    RAISE NOTICE 'Administrator email confirmed for % (User ID: %).', v_admin_email, v_admin_user_id;
  END IF;

  -- 4. Upgrade raw_app_meta_data with trusted role = 'admin'
  UPDATE auth.users
  SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin", "admin_provisioned_at": "now()"}'::jsonb,
      updated_at = now()
  WHERE id = v_admin_user_id;

  -- 5. Upsert active campus membership
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
    now(),
    NULL,
    'Initial authorized administrator explicitly provisioned via secure server script.'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    membership_type = 'admin',
    status = 'ACTIVE',
    expires_at = NULL,
    updated_at = now();

  -- 6. Log audit event
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_admin_user_id,
    'ADMIN_PROVISIONED',
    'campus_membership',
    v_admin_user_id,
    jsonb_build_object(
      'email', v_admin_email,
      'user_id', v_admin_user_id,
      'provisioned_at', now()
    )
  );

  RAISE NOTICE 'SUCCESS: Initial administrator % successfully provisioned with active admin membership.', v_admin_email;
END $$;

COMMIT;
