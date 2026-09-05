-- Follow-up fix: PostgREST's upsert on_conflict parameter only accepts
-- literal column names, not expressions like lower(email) — so the
-- expression unique index from the previous migration can't be used as
-- an upsert conflict target. Instead, guarantee every email column is
-- ALWAYS stored lowercase via a trigger (so no future write path, in this
-- codebase or any future one, can reintroduce a casing mismatch), then
-- put the unique constraint directly on the (now-always-lowercase) column.

create or replace function normalize_email()
returns trigger
language plpgsql
as $$
begin
  if new.email is not null then
    new.email = lower(new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_email_owners on owners;
create trigger trg_normalize_email_owners
  before insert or update on owners
  for each row execute function normalize_email();

drop trigger if exists trg_normalize_email_submissions on submissions;
create trigger trg_normalize_email_submissions
  before insert or update on submissions
  for each row execute function normalize_email();

-- Drop the expression index from the previous migration (can't be used
-- for upsert conflict targets anyway) and replace with a plain unique
-- constraint on the now-guaranteed-lowercase column.
drop index if exists idx_submissions_email_year_unique;

alter table submissions
  add constraint submissions_email_year_unique unique (email, year);
