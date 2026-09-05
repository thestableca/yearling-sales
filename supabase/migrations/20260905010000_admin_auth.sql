-- Phase 1: Admin authentication via Supabase Auth
-- Adds an `admins` table keyed to Supabase Auth's own user IDs, and RLS
-- policies gated on membership in that table. This replaces the client-side
-- passcode (ADMIN_PASSCODE_HASH + adminLoggedIn variable in app.js), which
-- had zero server-side enforcement.

-- =========================================================
-- admins table: who is allowed into the admin dashboard
-- =========================================================

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;

-- An admin can see the list of admins (so the UI can show "who else has access"),
-- but only admins — not the public, not a logged-in owner.
drop policy if exists "admins can read admin list" on admins;
create policy "admins can read admin list" on admins
  for select using (
    exists (select 1 from admins a where a.user_id = auth.uid())
  );

-- =========================================================
-- Helper function: is the current authenticated user an admin?
-- SECURITY DEFINER so it can check the admins table even from policies on
-- OTHER tables where the calling role might not otherwise have select
-- access to `admins` itself.
-- =========================================================

create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- =========================================================
-- Now that we have is_admin(), tighten the tables from Phase 0:
-- owners/submissions/responses get admin-only full access.
-- (sales/sale_years already have public read policies from schema.sql.)
-- =========================================================

drop policy if exists "admins can read owners" on owners;
create policy "admins can read owners" on owners
  for select using (is_admin());

drop policy if exists "admins can manage owners" on owners;
create policy "admins can manage owners" on owners
  for all using (is_admin()) with check (is_admin());

drop policy if exists "admins can read submissions" on submissions;
create policy "admins can read submissions" on submissions
  for select using (is_admin());

drop policy if exists "admins can manage submissions" on submissions;
create policy "admins can manage submissions" on submissions
  for all using (is_admin()) with check (is_admin());

drop policy if exists "admins can read responses" on responses;
create policy "admins can read responses" on responses
  for select using (is_admin());

drop policy if exists "admins can manage responses" on responses;
create policy "admins can manage responses" on responses
  for all using (is_admin()) with check (is_admin());

-- Admins can also manage reference data (add a new sale, edit a sale_year's
-- is_current flag, etc.) — public still gets read-only via the Phase 0 policies.
drop policy if exists "admins can manage sales" on sales;
create policy "admins can manage sales" on sales
  for all using (is_admin()) with check (is_admin());

drop policy if exists "admins can manage sale_years" on sale_years;
create policy "admins can manage sale_years" on sale_years
  for all using (is_admin()) with check (is_admin());
