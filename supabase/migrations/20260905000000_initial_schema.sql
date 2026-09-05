-- TheStable.ca — Supabase schema
-- Generated from database_schema_design.md

create extension if not exists "pgcrypto";

-- =========================================================
-- Reference data
-- =========================================================

create table if not exists sales (
  id text primary key,
  label text not null,
  active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists sale_years (
  id uuid primary key default gen_random_uuid(),
  sale_id text not null references sales(id),
  year int not null,
  label text not null,
  is_current boolean not null default false,
  opens_at timestamptz,
  closes_at timestamptz,
  unique (sale_id, year)
);

-- =========================================================
-- Identity (sensitive)
-- =========================================================

create table if not exists owners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

-- =========================================================
-- Submissions (top-level yes/no interest per owner per year)
-- =========================================================

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references owners(id),
  year int not null,
  interest text not null check (interest in ('yes', 'no')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- Responses (one row per owner per sale year, only for "yes")
-- =========================================================

create table if not exists responses (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id),
  owner_id uuid references owners(id),
  sale_year_id uuid not null references sale_years(id),
  participation text check (participation in ('bucket', 'specific', 'both')),
  gait text check (gait in ('trotter', 'pacer', 'both')),
  sex text check (sex in ('colt', 'filly', 'both')),
  bucket_types text[],
  bucket_level text,
  bucket_amount numeric check (bucket_amount is null or (bucket_amount >= 0 and bucket_amount <= 100)),
  max_yearlings text,
  specific_horse_count text,
  specific_share_size text,
  eligibility text[],
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_responses_sale_year_id on responses(sale_year_id);
create index if not exists idx_responses_owner_id on responses(owner_id);
create index if not exists idx_responses_submission_id on responses(submission_id);
create index if not exists idx_submissions_owner_id on submissions(owner_id);

-- =========================================================
-- Row Level Security — baseline policies
-- =========================================================

alter table sales enable row level security;
alter table sale_years enable row level security;
alter table owners enable row level security;
alter table submissions enable row level security;
alter table responses enable row level security;

-- sales / sale_years: public read-only reference data
drop policy if exists "sales are publicly readable" on sales;
create policy "sales are publicly readable" on sales
  for select using (true);

drop policy if exists "sale_years are publicly readable" on sale_years;
create policy "sale_years are publicly readable" on sale_years
  for select using (true);

-- owners: no public read access at all (admin-only via service role, which bypasses RLS)
-- No select policy is created here on purpose — default-deny.

-- submissions: no public read access — inserts happen via a controlled path.
-- (Intentionally no public select/insert/update policy yet — the app currently
-- writes via the service role from a trusted context. Tighten further once the
-- per-owner access-token mechanism described in the design doc is built.)

-- responses: same posture as submissions for now.

-- Nothing else is granted — everything defaults to fully closed until the
-- per-owner access-token policies described in database_schema_design.md are
-- added. This is deliberately conservative: safer to start closed and open up
-- specific access than to start open.

-- =========================================================
-- Seed reference data: the sales TheStable currently runs
-- =========================================================

insert into sales (id, label, active, sort_order) values
  ('ohio', 'Ohio Selected Sale', true, 1),
  ('lexington', 'Lexington Selected Sale', true, 2),
  ('harrisburg', 'Harrisburg Sale', true, 3),
  ('london', 'London Classic Yearling Sale', true, 4)
on conflict (id) do nothing;

insert into sale_years (sale_id, year, label, is_current) values
  ('ohio', 2026, 'Ohio Selected Sale — 2026', true),
  ('lexington', 2026, 'Lexington Selected Sale — 2026', true),
  ('harrisburg', 2026, 'Harrisburg Sale — 2026', true),
  ('london', 2026, 'London Classic Yearling Sale — 2026', true)
on conflict (sale_id, year) do nothing;
