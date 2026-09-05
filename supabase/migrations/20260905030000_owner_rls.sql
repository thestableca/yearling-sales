-- Phase 3: RLS policies letting a signed-in owner (via magic link) manage
-- ONLY their own submission/responses — matched against their verified
-- Supabase Auth email (auth.jwt() ->> 'email'), never a client-supplied
-- value. This is the mechanism the schema doc flagged as still needed:
-- "a per-owner access token, not their raw email."
--
-- auth.jwt() reads claims from the caller's own verified JWT — a signed-in
-- owner cannot forge a different email in it (that would require forging
-- Supabase's own signature), so this is safe to use directly as the
-- ownership check.

drop policy if exists "owner can manage own submission" on submissions;
create policy "owner can manage own submission" on submissions
  for all
  using (lower(email) = lower(auth.jwt() ->> 'email'))
  with check (lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "owner can manage own responses" on responses;
create policy "owner can manage own responses" on responses
  for all
  using (
    exists (
      select 1 from submissions s
      where s.id = responses.submission_id
        and lower(s.email) = lower(auth.jwt() ->> 'email')
    )
  )
  with check (
    exists (
      select 1 from submissions s
      where s.id = responses.submission_id
        and lower(s.email) = lower(auth.jwt() ->> 'email')
    )
  );

-- An owner should also be able to read their own `owners` row (to check
-- "have I submitted before" / load their name), but NOT the full owners
-- table (that stays admin-only, per the design doc).
drop policy if exists "owner can read own owner record" on owners;
create policy "owner can read own owner record" on owners
  for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Owners also need to be able to update their own name once identified
-- (the send-owner-magic-link function inserts a blank-name row on first
-- contact; the intake form fills in the real name on submit).
drop policy if exists "owner can update own owner record" on owners;
create policy "owner can update own owner record" on owners
  for update
  using (lower(email) = lower(auth.jwt() ->> 'email'))
  with check (lower(email) = lower(auth.jwt() ->> 'email'));
