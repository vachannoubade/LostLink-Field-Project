-- ============================================================================
-- LostLink Supabase Database Schema & Row-Level Security (RLS) Policies
-- Run this script in your Supabase SQL Editor when connecting a Supabase project
-- ============================================================================

-- 1. Profiles table linked to Supabase auth.users
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text not null,
  role text default 'Campus Student',
  department text default 'General Campus',
  student_id text,
  bio text,
  karma_points integer default 100,
  reunions_helped integer default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using ( true );

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update their own profile"
  on public.profiles for update
  using ( auth.uid() = id )
  with check ( auth.uid() = id );

-- Automatically create a profile row when a new user signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'Verified Campus Member')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Lost & Found Reports Table with Backend Authorization via RLS
create table if not exists public.reports (
  id uuid default gen_random_uuid() primary key,
  type text not null check (type in ('lost', 'found')),
  title text not null,
  category text not null,
  description text not null,
  location text not null,
  campus_zone text,
  date text not null,
  time text,
  image_url text,
  status text not null default 'lost' check (status in ('lost', 'found', 'resolved')),
  user_id uuid references auth.users on delete cascade not null,
  reporter_name text,
  reporter_role text,
  gratitude_note text,
  urgency text default 'normal',
  helpful_count integer default 1,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.reports enable row level security;

-- Anyone can browse lost & found items
create policy "Reports are viewable by everyone"
  on public.reports for select
  using ( true );

-- Only authenticated users can create reports, and user_id must match their auth.uid()
create policy "Authenticated users can create reports"
  on public.reports for insert
  to authenticated
  with check ( auth.uid() = user_id );

-- Only the report owner can update or delete their report
create policy "Users can update their own reports"
  on public.reports for update
  to authenticated
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

create policy "Users can delete their own reports"
  on public.reports for delete
  to authenticated
  using ( auth.uid() = user_id );
