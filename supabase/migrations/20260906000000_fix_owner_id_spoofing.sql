-- Security fix: the "owner can manage own submission" RLS policy only
-- checked that `email` matched the caller's verified auth email — it did
-- not check that `owner_id` (if set) actually belongs to that same email.
-- This let a signed-in owner insert/update a submission row that claims a
-- DIFFERENT owner's owner_id while keeping their own email, polluting the
-- identity linkage. Found via adversarial RLS testing (see
-- 25_rls_edge_cases.js) before this ever reached real owner data.
--
-- Fix: owner_id must be either null, or match an owners row whose email
-- equals the caller's own verified email — never someone else's id.

drop policy if exists "owner can manage own submission" on submissions;
create policy "owner can manage own submission" on submissions
  for all
  using (lower(email) = lower(auth.jwt() ->> 'email'))
  with check (
    lower(email) = lower(auth.jwt() ->> 'email')
    and (
      owner_id is null
      or owner_id in (select id from owners where lower(email) = lower(auth.jwt() ->> 'email'))
    )
  );

-- Same fix for responses.owner_id (set directly by persistSubmission()).
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
    and (
      owner_id is null
      or owner_id in (select id from owners where lower(email) = lower(auth.jwt() ->> 'email'))
    )
  );
