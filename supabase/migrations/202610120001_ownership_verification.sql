-- ============================================================================
-- Migration: 202610120001_ownership_verification.sql
-- Purpose: Secure Item Ownership Verification, Claims, Private Evidence & Audit Logs
-- Preserves all existing tables and data in public.profiles and public.reports
-- ============================================================================

-- 0. Server-controlled administrator roles table (never editable by ordinary users)
create table if not exists public.admin_users (
  user_id uuid references auth.users on delete cascade primary key,
  granted_by text default 'system',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.admin_users enable row level security;

-- Only admins can view the admin_users table; ordinary users cannot insert/update/delete
create policy "Admins can view admin_users"
  on public.admin_users for select
  to authenticated
  using ( exists (select 1 from public.admin_users a where a.user_id = auth.uid()) );

-- Helper function to check if current authenticated user is a verified administrator
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- Add non-sensitive public flags to public.reports if not present
alter table public.reports
  add column if not exists has_private_verification boolean default false,
  add column if not exists enhanced_verification boolean default false,
  add column if not exists estimated_value numeric default 0;

-- ============================================================================
-- 1. Item Verification Details Table (Strictly Restricted)
-- ============================================================================
create table if not exists public.item_verification_details (
  item_id uuid references public.reports(id) on delete cascade primary key,
  finder_id uuid references auth.users(id) on delete cascade not null,
  private_prompts jsonb not null default '[]'::jsonb, -- [{ id, promptLabel, secretAnswer }]
  enhanced_verification boolean default false not null,
  estimated_value numeric default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_item_verification_finder on public.item_verification_details(finder_id);

alter table public.item_verification_details enable row level security;

-- Strictly restrict SELECT to the item's authorized finder OR a verified administrator.
-- Public visitors and claimants NEVER have SELECT access to secret answers!
create policy "Only authorized finder or admin can view private verification details"
  on public.item_verification_details for select
  to authenticated
  using ( auth.uid() = finder_id or public.is_admin() );

create policy "Authorized finder can insert verification details for their own item"
  on public.item_verification_details for insert
  to authenticated
  with check (
    auth.uid() = finder_id
    and exists (
      select 1 from public.reports r
      where r.id = item_id and r.user_id = auth.uid() and r.type = 'found'
    )
  );

create policy "Authorized finder or admin can update verification details"
  on public.item_verification_details for update
  to authenticated
  using ( auth.uid() = finder_id or public.is_admin() )
  with check ( auth.uid() = finder_id or public.is_admin() );

-- Safe RPC function returning ONLY prompt labels (never secret answers) to authenticated claimants
create or replace function public.get_public_verification_prompts(target_item_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
stable
as $$
declare
  raw_prompts jsonb;
  sanitized jsonb := '[]'::jsonb;
  elem jsonb;
begin
  select private_prompts into raw_prompts
  from public.item_verification_details
  where item_id = target_item_id;

  if raw_prompts is null then
    return '[]'::jsonb;
  end if;

  for elem in select * from jsonb_array_elements(raw_prompts)
  loop
    sanitized := sanitized || jsonb_build_object(
      'id', elem->>'id',
      'promptLabel', elem->>'promptLabel'
    );
  end loop;

  return sanitized;
end;
$$;

-- ============================================================================
-- 2. Claims Table with Uniqueness & Atomic Handover Constraints
-- ============================================================================
create table if not exists public.claims (
  id uuid default gen_random_uuid() primary key,
  item_id uuid references public.reports(id) on delete cascade not null,
  finder_id uuid references auth.users(id) on delete cascade not null,
  claimant_id uuid references auth.users(id) on delete cascade not null,
  explanation text not null,
  submitted_answers jsonb not null default '[]'::jsonb,
  truthfulness_confirmed boolean not null default true,
  status text not null default 'finder_review_required' check (
    status in (
      'submitted',
      'verification_pending',
      'additional_evidence_required',
      'finder_review_required',
      'administrator_review_required',
      'approved_for_handover',
      'rejected',
      'handed_over'
    )
  ),
  verification_status text not null default 'pending',
  automated_score numeric default 0,
  risk_flags jsonb not null default '[]'::jsonb,
  requires_admin_review boolean not null default false,
  escalation_reason text,
  finder_decision jsonb,
  admin_decision jsonb,
  handover_confirmation jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint chk_claimant_not_finder check (claimant_id <> finder_id)
);

create index if not exists idx_claims_item_id on public.claims(item_id);
create index if not exists idx_claims_claimant_id on public.claims(claimant_id);
create index if not exists idx_claims_finder_id on public.claims(finder_id);
create index if not exists idx_claims_status on public.claims(status);

-- Prevent duplicate active claims by the same user for the same item
create unique index if not exists idx_unique_active_claim_per_user_item
  on public.claims (item_id, claimant_id)
  where status not in ('rejected');

-- Prevent race conditions: at most ONE claim per item can be approved_for_handover or handed_over
create unique index if not exists idx_single_approved_or_handed_over_claim
  on public.claims (item_id)
  where status in ('approved_for_handover', 'handed_over');

alter table public.claims enable row level security;

-- Claimants can view ONLY their own claims; Finders can view claims for items they found; Admins can view all
create policy "Authorized users can view relevant claims"
  on public.claims for select
  to authenticated
  using (
    auth.uid() = claimant_id
    or auth.uid() = finder_id
    or public.is_admin()
  );

-- Claimants can insert claims for items they did NOT find
create policy "Authenticated claimants can submit claims"
  on public.claims for insert
  to authenticated
  with check (
    auth.uid() = claimant_id
    and auth.uid() <> finder_id
  );

-- ============================================================================
-- 3. Private Claim Evidence Table & Storage Policies
-- ============================================================================
create table if not exists public.claim_evidence (
  id uuid default gen_random_uuid() primary key,
  claim_id uuid references public.claims(id) on delete cascade not null,
  uploading_user_id uuid references auth.users(id) on delete cascade not null,
  private_storage_path text not null,
  evidence_type text not null,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_claim_evidence_claim_id on public.claim_evidence(claim_id);

alter table public.claim_evidence enable row level security;

create policy "Only claimant, item finder, or admin can view claim evidence"
  on public.claim_evidence for select
  to authenticated
  using (
    auth.uid() = uploading_user_id
    or public.is_admin()
    or exists (
      select 1 from public.claims c
      where c.id = claim_id and (c.claimant_id = auth.uid() or c.finder_id = auth.uid())
    )
  );

create policy "Claimant can upload evidence to their own claim"
  on public.claim_evidence for insert
  to authenticated
  with check (
    auth.uid() = uploading_user_id
    and exists (
      select 1 from public.claims c
      where c.id = claim_id and c.claimant_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. Immutable Audit Log Table
-- ============================================================================
create table if not exists public.audit_logs (
  id uuid default gen_random_uuid() primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  claim_id uuid references public.claims(id) on delete set null,
  item_id uuid references public.reports(id) on delete set null,
  previous_status text,
  new_status text,
  reason text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_audit_logs_item_id on public.audit_logs(item_id);
create index if not exists idx_audit_logs_claim_id on public.audit_logs(claim_id);

alter table public.audit_logs enable row level security;

-- Only admins and the item's finder can read relevant audit logs; NO UPDATE or DELETE policies exist (immutable)
create policy "Admins and item finders can read audit logs"
  on public.audit_logs for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.reports r
      where r.id = item_id and r.user_id = auth.uid()
    )
  );
