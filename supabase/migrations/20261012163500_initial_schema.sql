-- =============================================================================
-- LostLink — Initial Database Schema & Row-Level Security Migration
-- Migration Timestamp: 20261012163500
-- =============================================================================

-- Ensure pgcrypto extension is available for environments that need it.
-- Note: PostgreSQL 13+ (standard in Supabase) includes gen_random_uuid() natively.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Table: public.profiles
-- -----------------------------------------------------------------------------
-- Stores minimal public profile information. Sensitive identity details
-- (e.g. university email and auth credentials) remain protected in auth.users.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Trigger Function: public.handle_new_user
-- -----------------------------------------------------------------------------
-- Automatically creates a public profile row when an authenticated user signs up.
-- Uses SECURITY DEFINER with a fixed search_path to prevent privilege escalation.
-- Wraps in exception handling so unexpected profile insertion issues never abort signups.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
      'Campus Student'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Emit warning in server logs while allowing the auth.users signup transaction to complete
  RAISE WARNING 'handle_new_user trigger encountered an error for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Idempotent trigger binding on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Revoke execution from public (trigger function should only be invoked by postgres/system)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 3. Profile Self-Repair Function: public.ensure_profile_exists
-- -----------------------------------------------------------------------------
-- Enables an authenticated user to idempotently create or repair their profile
-- if the signup trigger was bypassed or for existing accounts.
CREATE OR REPLACE FUNCTION public.ensure_profile_exists()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, name)
    VALUES (
      auth.uid(),
      COALESCE(
        NULLIF(trim((SELECT raw_user_meta_data->>'name' FROM auth.users WHERE id = auth.uid())), ''),
        NULLIF(trim((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = auth.uid())), ''),
        'Campus Student'
      )
    )
    ON CONFLICT (id) DO UPDATE SET updated_at = now()
    RETURNING * INTO v_profile;
  END IF;

  RETURN v_profile;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_profile_exists() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_profile_exists() TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Table: public.reports
-- -----------------------------------------------------------------------------
-- Stores lost and found reports submitted by campus students.
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('lost', 'found')),
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('Electronics', 'ID Cards', 'Bags', 'Books', 'Accessories', 'Keys', 'Other')
  ),
  description TEXT NOT NULL,
  location TEXT NOT NULL,
  date DATE NOT NULL,
  time TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'lost' CHECK (status IN ('lost', 'found', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent constraint: Ensure status is consistent with report type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_report_status_matches_type'
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT check_report_status_matches_type
      CHECK (
        (type = 'lost' AND status IN ('lost', 'resolved')) OR
        (type = 'found' AND status IN ('found', 'resolved'))
      );
  END IF;
END $$;

-- Indexes for report query performance
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_type_status ON public.reports(type, status);
CREATE INDEX IF NOT EXISTS idx_reports_category ON public.reports(category);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports(created_at DESC);

-- -----------------------------------------------------------------------------
-- 5. Report Integrity & Resolution Triggers
-- -----------------------------------------------------------------------------
-- Enforces business invariants on report updates:
-- 1. If a report is already resolved, lock it completely against any edits or reopening
-- 2. Report type cannot be changed after creation
-- 3. Ownership cannot be transferred
-- 4. updated_at is kept fresh automatically
CREATE OR REPLACE FUNCTION public.handle_report_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Disallow any modification or reopening of an already resolved report
  IF OLD.status = 'resolved' THEN
    RAISE EXCEPTION 'Resolved reports are archived and cannot be edited or reopened';
  END IF;

  -- Prevent changing report type
  IF NEW.type <> OLD.type THEN
    RAISE EXCEPTION 'Report type cannot be changed after creation';
  END IF;

  -- Prevent transferring report to another user
  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Report ownership cannot be transferred';
  END IF;

  -- Automatically update updated_at timestamp
  NEW.updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_report_update ON public.reports;
CREATE TRIGGER on_report_update
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_report_update();

REVOKE EXECUTE ON FUNCTION public.handle_report_update() FROM PUBLIC;

-- When a report transitions to resolved, automatically mark any pending candidate matches
-- involving this report as rejected (runs with SECURITY DEFINER so it succeeds even though
-- client RLS intentionally denies client direct writes to public.matches).
CREATE OR REPLACE FUNCTION public.handle_report_resolved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'resolved' AND NEW.status = 'resolved' THEN
    UPDATE public.matches
    SET status = 'rejected', updated_at = now()
    WHERE (lost_report_id = NEW.id OR found_report_id = NEW.id)
      AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_report_resolved ON public.reports;
CREATE TRIGGER on_report_resolved
  AFTER UPDATE OF status ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_report_resolved();

REVOKE EXECUTE ON FUNCTION public.handle_report_resolved() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 6. Authorized Resolution Procedure: public.resolve_report
-- -----------------------------------------------------------------------------
-- Dedicated secure procedure for owners to mark an item as recovered/resolved.
CREATE OR REPLACE FUNCTION public.resolve_report(report_id UUID)
RETURNS public.reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.reports;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_report
  FROM public.reports
  WHERE id = report_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or permission denied';
  END IF;

  IF v_report.status = 'resolved' THEN
    RAISE EXCEPTION 'Report is already resolved';
  END IF;

  UPDATE public.reports
  SET status = 'resolved', updated_at = now()
  WHERE id = report_id
  RETURNING * INTO v_report;

  RETURN v_report;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_report(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_report(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Table: public.matches
-- -----------------------------------------------------------------------------
-- Stores paired candidate matches discovered between lost and found items.
CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lost_report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  found_report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  reasons TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent constraints for matches
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_different_reports'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT check_different_reports
      CHECK (lost_report_id != found_report_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_match_pair'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT unique_match_pair
      UNIQUE (lost_report_id, found_report_id);
  END IF;
END $$;

-- Indexes for match retrieval
CREATE INDEX IF NOT EXISTS idx_matches_lost_report_id ON public.matches(lost_report_id);
CREATE INDEX IF NOT EXISTS idx_matches_found_report_id ON public.matches(found_report_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);

-- -----------------------------------------------------------------------------
-- 8. Table: public.notifications
-- -----------------------------------------------------------------------------
-- Stores user-specific alerts (e.g. potential match discoveries).
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for notification inbox ordering
CREATE INDEX IF NOT EXISTS idx_notifications_user_inbox ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read);

-- =============================================================================
-- Row-Level Security (RLS) Configuration
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- RLS Policies: public.profiles
-- -----------------------------------------------------------------------------
-- Authenticated students can read display names of item reporters
DROP POLICY IF EXISTS "Profiles are readable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are readable by authenticated users"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert their own profile as a fallback if the trigger was bypassed
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can only modify their own profile
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- RLS Policies: public.reports
-- -----------------------------------------------------------------------------
-- All authenticated campus users can browse reports
DROP POLICY IF EXISTS "Reports are readable by authenticated users" ON public.reports;
CREATE POLICY "Reports are readable by authenticated users"
  ON public.reports
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert reports only under their own user_id
DROP POLICY IF EXISTS "Users can create their own reports" ON public.reports;
CREATE POLICY "Users can create their own reports"
  ON public.reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Owners can update their reports; user_id reassignment is forbidden
DROP POLICY IF EXISTS "Users can update their own reports" ON public.reports;
CREATE POLICY "Users can update their own reports"
  ON public.reports
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Owners can delete their own reports
DROP POLICY IF EXISTS "Users can delete their own reports" ON public.reports;
CREATE POLICY "Users can delete their own reports"
  ON public.reports
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- RLS Policies: public.matches
-- -----------------------------------------------------------------------------
-- Users can only view candidate matches if they own either the lost or found report
DROP POLICY IF EXISTS "Users can view matches involving their reports" ON public.matches;
CREATE POLICY "Users can view matches involving their reports"
  ON public.matches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE reports.id IN (matches.lost_report_id, matches.found_report_id)
        AND reports.user_id = auth.uid()
    )
  );

-- NOTICE: Client-side INSERT, UPDATE, and DELETE policies for public.matches
-- are deliberately omitted. Match discovery, score calculation, and verification
-- state transitions must be handled by trusted database functions or Edge Functions
-- to prevent arbitrary client tampering.

-- -----------------------------------------------------------------------------
-- RLS Policies: public.notifications
-- -----------------------------------------------------------------------------
-- Recipients can only view their own notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Recipients can update read status on their own notifications
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Recipients can delete their own notifications
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- NOTICE: Direct client INSERT policy for public.notifications is deliberately
-- omitted. Notifications must be generated exclusively by system triggers
-- (e.g. on new match detection) rather than arbitrary client-initiated requests.
