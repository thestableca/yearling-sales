-- Phase 5: move Anthony's own configuration (question sets, confirmed
-- buckets, exchange rate, pasted owner roster, dashboard metrics history)
-- from browser localStorage into the database. Not a security fix (none
-- of this is owner personal data) — a robustness fix, so Anthony's
-- settings survive a cleared cache or a different device/browser.
--
-- A single key/value table (rather than five separate tables) fits this
-- data well: each of these is already a single JSON blob in localStorage
-- today, and none of it needs relational queries (no joins, no per-row
-- filtering) — it's read as one object and written as one object, exactly
-- like localStorage.getItem/setItem was.

create table if not exists admin_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table admin_settings enable row level security;

drop policy if exists "admins can manage settings" on admin_settings;
create policy "admins can manage settings" on admin_settings
  for all using (is_admin()) with check (is_admin());

-- Question sets need to be readable by owners too (the intake form reads
-- the question set to know what to ask) — but only readable, never
-- writable, and only the question_sets key specifically.
drop policy if exists "anyone can read question sets" on admin_settings;
create policy "anyone can read question sets" on admin_settings
  for select using (key = 'question_sets');
