-- Fixes two real bugs found via adversarial testing (2026-09-06):
--
-- 1. No unique constraint existed on submissions(email, year) — two
--    concurrent submits for the same owner (e.g. two browser tabs, or a
--    slow network causing a user to click Submit twice before the button
--    disabled) could both fail to find an "existing" row and both insert,
--    creating silent duplicate submissions with no error to anyone.
--
-- 2. Email casing was never normalized at the database level — a lookup
--    for "Name@Example.com" would not find a row stored as
--    "name@example.com", risking duplicate rows for what is really the
--    same owner. Normalizing email to lowercase on write, and adding the
--    unique index on lower(email) rather than raw email, fixes this at
--    the source rather than relying on every future query remembering to
--    call .toLowerCase() (which one call site in db.js's own
--    persistSubmission() had already forgotten to do).

-- Normalize any existing data first (harmless no-op if already lowercase).
update submissions set email = lower(email) where email <> lower(email);
update owners set email = lower(email) where email <> lower(email);

-- Add a case-insensitive unique constraint on (email, year). Using a
-- unique INDEX on lower(email) rather than a table CHECK/UNIQUE
-- constraint directly on email, since Postgres unique constraints can't
-- reference a function (lower()) directly without an expression index.
create unique index if not exists idx_submissions_email_year_unique
  on submissions (lower(email), year);

-- responses.owner_id/submission_id already prevent duplicate response
-- rows for the same submission+sale_year in practice (persistSubmission
-- always deletes-then-reinserts all of a submission's responses
-- together), but add a defensive unique constraint here too so a bug
-- elsewhere can't silently create two response rows for the same
-- submission+sale_year.
create unique index if not exists idx_responses_submission_saleyear_unique
  on responses (submission_id, sale_year_id);
