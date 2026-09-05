-- Phase 3: switch `responses` to a single `answers` JSONB column.
--
-- The fixed-column design in the original schema doc couldn't represent the
-- "detailed" bucket mode (per-gait, per-bucket-type matrix) without a child
-- table. Rather than force that complexity now, store the whole per-sale
-- answer object (participation/gait/sex/bucketTypes/bucketMatrix/etc.,
-- exactly what app.js already builds as draft.saleResponses[saleId]) as one
-- JSONB blob per response row. This matches the already-existing
-- "Vragenmodule" plan's direction and avoids two different response shapes
-- (flat columns now, JSONB later) existing at different points in time.

alter table responses
  drop column if exists participation,
  drop column if exists gait,
  drop column if exists sex,
  drop column if exists bucket_types,
  drop column if exists bucket_level,
  drop column if exists bucket_amount,
  drop column if exists max_yearlings,
  drop column if exists specific_horse_count,
  drop column if exists specific_share_size,
  drop column if exists eligibility;

alter table responses
  add column if not exists answers jsonb not null default '{}'::jsonb;

-- submissions also needs a place to carry the owner-entered name and the
-- top-level fields the intake form collects once per submission (not per
-- sale): eligibilityPreferences, applyMode, selectedSales. These apply
-- once per submission, not once per sale_year, so they belong on
-- submissions rather than repeated on every responses row.
alter table submissions
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists eligibility_preferences text[],
  add column if not exists apply_mode text,
  add column if not exists unmatched boolean not null default false;

create index if not exists idx_submissions_email on submissions(lower(email));
