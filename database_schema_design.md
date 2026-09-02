# TheStable.ca — Supabase database schema (design)

Status: design only, not yet built. Waiting on TheStable's final intake questions and anonymity decision before creating the actual Supabase project. This document is the reference for when we do.

## Design principles

- **Identity is separated from answers.** `owners` (name/email) is a distinct table from `responses` (what they answered). This is required regardless of the anonymity decision — level 1 (hide from Anthony's dashboard) and level 2 (no linkage at all) are both just different Row Level Security policies on top of the same two-table structure. No rebuild needed either way.
- **Reference data lives in its own tables**, not hardcoded arrays in JavaScript, so TheStable can eventually add/edit a sale or bucket type without a code change.
- **One response row per owner per sale** (not one giant JSON blob per owner), so the admin dashboard can filter/aggregate with plain SQL instead of parsing nested JSON in JavaScript — this is what makes search/filter/sort fast once there's real volume.

- **Every response belongs to a sale year/edition**, not just a sale. Sales recur annually (Ohio 2026, Ohio 2027, ...) — without a year scope, next year's submissions would either overwrite this year's data or get silently mixed into the same aggregates. This must be in the schema from day one, not added after 2027 data starts arriving.

## Tables

### `sale_years` (reference data — one row per sale per year)
| column | type | notes |
|---|---|---|
| id | uuid (PK) | generated |
| sale_id | text (FK → sales.id) | which sale, e.g. `ohio` |
| year | int | e.g. `2026` |
| label | text | display name, e.g. "Ohio Selected Sale — 2026" |
| is_current | boolean | marks the active intake period; the owner intake flow and admin dashboard both filter to this by default |
| opens_at / closes_at | timestamptz | optional, for a future "intake window" concept |

`responses.sale_year_id` (see below) points here instead of directly at `sales.id`, so every submission is unambiguously scoped to one year. The dashboard defaults to `is_current = true`; a past year's data stays queryable for year-over-year comparison without being deleted or needing a separate archive process.

### `sales` (reference data — the sale itself, independent of year)
| column | type | notes |
|---|---|---|
| id | text (PK) | e.g. `ohio`, `lexington`, `harrisburg`, `london` |
| label | text | display name, e.g. "London Classic Yearling Sale" |
| active | boolean | so a discontinued sale can be hidden without deleting history |
| sort_order | int | controls display order |

### `owners` (identity — the sensitive table)
| column | type | notes |
|---|---|---|
| id | uuid (PK) | generated |
| name | text | |
| email | text (unique) | used to recognize a returning owner |
| created_at | timestamptz | |

This is the table that gets restricted or dropped from the query entirely if the anonymity answer is "level 2." See RLS section below.

### `submissions` (one row per owner per intake — the top-level "yes/no interested" answer)
| column | type | notes |
|---|---|---|
| id | uuid (PK) | |
| owner_id | uuid (FK → owners.id, nullable) | |
| year | int | which year's intake this belongs to |
| interest | text | yes/no — the top-level "are you interested in 2026" question |
| submitted_at / updated_at | timestamptz | |

This exists because an owner who answers "no" has zero sale-scoped rows to attach an answer to — app.js's own logic confirms this: `interest = "no"` submits with `selectedSales: []` and `saleResponses: {}` (no per-sale data at all). Putting `interest` directly on `responses` (as an earlier version of this doc did) can't represent that case, since every `responses` row requires a `sale_year_id`. A "yes" answer has one `submissions` row plus one or more `responses` rows (below); a "no" answer has only the `submissions` row.

### `responses` (one row per owner per sale year — only for owners who said "yes")
| column | type | notes |
|---|---|---|
| id | uuid (PK) | |
| submission_id | uuid (FK → submissions.id) | |
| owner_id | uuid (FK → owners.id, nullable) | null if the anonymity decision requires no link at all |
| sale_year_id | uuid (FK → sale_years.id) | scopes every response to one sale AND one year — see `sale_years` above |
| participation | text | bucket / specific / both |
| gait | text | trotter / pacer / both |
| sex | text | colt / filly / both |
| bucket_types | text[] | premium / balanced / value, multi-select |
| bucket_level | text | 1/2/5/10/20/30/other |
| bucket_amount | numeric | custom percentage, clamped 0-100 (already enforced client-side) |
| max_yearlings | text | |
| specific_horse_count | text | |
| specific_share_size | text | |
| eligibility | text[] | states/provinces |
| submitted_at | timestamptz | |
| updated_at | timestamptz | so a resubmission is visible as an update, not a silent overwrite (matches the "previous submission found" notice already built into the UI) |

Note: the current app stores a nested `bucketMatrix` (per-gait, per-bucket-type detail) for the "detailed" flow. That either needs its own child table (`response_bucket_matrix`) or gets flattened into one row per gait+bucket-type combination — worth deciding once TheStable's final question set is known, since it may simplify or remove this "detailed" mode entirely.

## Row Level Security (RLS) — the actual security mechanism

Supabase's public "anon key" is embedded in the site's client-side code and is visible to anyone — RLS policies are what actually restrict access, not the key itself.

**Baseline policies (needed regardless of the anonymity answer):**
- `owners` table: no public read access at all. Only an authenticated admin session (see [[security-requirements]]) can read it.
- `responses` table: a visitor can insert their own response and can read/update only the response matching their own session (via a per-owner access token, not their raw email — see below). Full-list read is admin-only.
- `sales` table: public read-only (it's just reference data, not sensitive).

**If the anonymity answer is "level 1"** (hide from Anthony's dashboard view, but keep the link): admin queries join `responses` to `owners` but the dashboard UI simply doesn't render the name/email columns. Data stays linked in the database for Anthony's actual follow-up/contact use case.

**If the anonymity answer is "level 2"** (no linkage anywhere): `responses.owner_id` stays null, and identity (if collected at all, e.g. for a separate opt-in contact list) lives in a completely separate, unlinked table with no foreign key back to `responses`. This is the scenario that requires the separate-contact-mechanism design discussed with Anthony (see [[anonymity-requirement]]).

**Identifying a returning owner without exposing all emails to the client:** rather than matching on raw email client-side (as the current prototype does by comparing against a hardcoded `OWNERS` array), use a Supabase Edge Function or RLS policy keyed on a per-owner magic-link token, so the client never needs read access to the full owners list just to check "have I submitted before."

## Notifying Anthony of new submissions

Right now there is no mechanism anywhere in the app that tells Anthony a new response arrived — he would have to manually log in and check. This needs to be scoped as part of the database build, not left as a manual habit, especially with ~900 owners potentially submitting over days/weeks before a sale.

Options once Supabase exists (pick one when building):
- A scheduled Supabase Edge Function that emails Anthony a daily digest ("14 new responses since yesterday") — simplest, no real-time complexity.
- A database webhook/trigger on `responses` insert that calls an email API (e.g. Resend, Postmark) — near-instant, more moving parts.
- At minimum, a "new since last visit" counter badge on the dashboard itself — doesn't solve "Anthony doesn't know to check," but is nearly free to add alongside the dashboard query.

## What this unblocks

This schema can be created in Supabase now, independent of TheStable's pending answers — the `owners`/`responses`/`sale_years` split, RLS baseline, and reference tables (`sales`) are needed either way. Only the exact shape of `responses` (which fields survive TheStable's question revision) and the final call on `owner_id` nullability depend on their reply.

## Other flagged items to resolve before real owner data flows through this

- **Data deletion requests (PIPEDA)**: no process yet for "an owner asks to be removed." Needs at minimum a one-line agreed process with TheStable (e.g. "Anthony deletes the row manually via the Supabase dashboard on request") — doesn't need to be automated, just decided.
- **Investment-intent language**: some existing UI copy ("reserve" a bucket percentage, "Potential coverage: 136.5%") reads closer to a pooled-investment pitch than a soft interest survey — the project brief itself already flags this tension. This is a legal question for TheStable, not a dev decision — flag it, don't silently reword it.
- **Real owner list handling**: the current hardcoded `OWNERS` array in `app.js` (Robert Sikkema, Brian L., Mark D., Jennifer S. — all fake emails) must never be replaced with TheStable's real ~900-owner list before Supabase + RLS exist. A real owner list in client-side JS on public GitHub Pages would be readable by anyone.
- **Custom domain**: `github.io` is fine for the demo phase happening now, but isn't ideal as the long-term public-facing URL once real names/emails/investment intent are collected from real owners. Natural to bundle with the ownership-transfer milestone already tracked in memory.

## Data-integrity lessons from the localStorage prototype (carry these into the Supabase migration)

- **Always normalize/validate data read back from storage before merging it into live app state**, even data the app wrote itself. `prototype_v3/app.js` had a real bug (fixed 2026-08-29) where resuming an existing submission spread the raw stored response object directly into draft state, bypassing the normalization step that a fresh draft always goes through — any future field drift between what's stored and what the UI expects would have produced silent `undefined` reads. When building the Supabase-backed version, apply the same discipline: never trust a row read from the database to exactly match the current expected shape without a normalization/validation step, especially across a schema migration.
- **Keep row-building logic consistent across all code paths that produce the same kind of row.** `flattenResponses()` in app.js builds owner-detail rows via three different branches (detailed bucket, simple bucket, specific-only) that don't all produce the same set of fields — harmless today only because nothing currently reads a field a given branch happens to omit. Worth deliberately designing the equivalent Supabase query/view to return one consistent row shape regardless of which intake path an owner took, rather than replicating this branch-shaped inconsistency in SQL.
