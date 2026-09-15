# Handoff: Book 2 data-quality fix for the Sale History page

Written by an assistant working in the separate `juveniq` project, at
Robert's request, after he noticed the published "Sale History -
TheStable.ca.pdf" used Harrisburg Book 2 data without a filter this
session found necessary. This file is for the agent working in *this*
project (`request yearling sales` / `prototype_v3/app.js`) to verify
independently and then apply. Nothing in the `juveniq` project's own
database or code was changed to produce this — this is read-only
analysis, cross-referenced against `data/juveniq.db`.

**APPLIED 2026-09-15, with one correction to the exclusion logic
below.** Independent verification against `data/juveniq.db` found the
example Python code's "single appearance, small gap" branch didn't
actually check `len(appearances) == 1` before applying `gap <= 1` —
it excluded 2 extra rows (both a "BELLINO"/"Bellino" name collision:
3 sale_results appearances, 2 different sires, so genuinely
unconfirmed) that don't meet the rule as described in prose. One of
those 2 was in `lexington_selected`, contradicting this doc's own
"Lexington: zero change" finding below. Fixed by requiring
`len(appearances) == 1` before the gap check. Corrected result: **252
excluded (not 254), 24,424 total (not 24,422)** — Harrisburg $100k+
still lands at exactly 81 of 1,061 = 7.63% either way, so the headline
finding is unaffected. `build_analysis.py`, `bucket_simulation.py`,
and a new `age_table.py` (reproduces the "top performer by age" table,
whose original generating script wasn't preserved in this project —
its matching rule was reverse-engineered by testing against the
previously-published page's exact percentages until an exact match
was found: "at N" = a top_performers entry in EXACTLY season
`sale_year + N - 1`, independent per row) now all encode the corrected
rule. `sale_history_v2_final_results.json` was regenerated with the
corrected numbers — see that file for the authoritative per-section
figures instead of the tables below, which still show the original
(254-exclusion) numbers from this handoff.

## What was found

`build_analysis.py` in this folder pulls `sale_type IN
('yearling_book1','yearling_book2','lexington_selected','ohio_jug')`
straight from `sale_results`, 2014-2023, with no further filtering. That
is correct for `yearling_book1`, `lexington_selected`, and `ohio_jug` —
but `yearling_book2` turns out to contain a small number of rows that are
**not actually yearlings at their listed `sale_year`**: horses that had
already raced (appeared in `top_performers`) before or during the year
they're listed as sold. A true yearling cannot have a prior race record —
by definition it hasn't raced yet — so any row where that happens is
either a genuine re-sale of an older, already-campaigned horse, or (less
often) two different horses that happen to share a name colliding in the
match (a known issue in this dataset: 1,858 reused horse names, already
handled elsewhere in `build_analysis.py`'s season-scoped matching logic).

**This does not mean Book 2 itself is bad data or should be excluded.**
An earlier hypothesis this session — that Book 2 sex codes ('g' for
gelding, and a skewed colt/filly split) indicated Book 2 was really a
mixed broodmare/stallion sale bleeding into the yearling data — was
tested and found **wrong**: over 93% of every sex category (including
'gelding') had never raced at time of "sale," consistent with genuine
(if occasionally miscoded) yearlings, not older breeding stock. Book 2
is real, mostly-usable yearling data. The issue is narrower: a small
number of individual rows within it are re-sold older horses, not that
the whole book is contaminated.

## How the exclusion was decided (to avoid a new mistake)

A first attempt excluded every row with *any* prior race record before
its `sale_year` (312 of 24,676 rows). That was too aggressive: checking
the size of the gap between `sale_year` and the horse's earliest known
race season showed 100 of those 312 had a gap of 5+ years — almost
certainly name collisions (an unrelated, much older horse sharing a
name), not the same horse resold. Gap size alone isn't fully reliable
either though (`top_performers` only starts in 2008, so a horse's
"earliest" race season is sometimes just an artifact of data coverage,
not a real fact about that horse).

The version actually used cross-references `sale_results` itself: if the
same normalized horse name appears in `sale_results` at multiple
`sale_year`s with a **consistent sire** each time, that's direct proof
it's the same horse being re-listed (184 of the 312 confirmed this way,
vs. only 2 where the sire differed across appearances — confirmed
collisions, correctly kept in the population). For rows with only a
single `sale_results` appearance, unconfirmable either way, only a small
gap (0-1 years between `sale_year` and earliest race record — plausibly
the same horse resold shortly after its career started) was treated as
exclusion-worthy; a large, unconfirmed gap was left in the population
rather than guessed away.

**Final rule**: exclude a `sale_results` row from the "true yearling"
population if EITHER (a) the same name appears elsewhere in
`sale_results` with a matching sire (confirmed same horse), OR (b) it's
a single appearance with 0-1 year gap to its earliest race record
(plausible same-year resale). Otherwise, keep it — even if it has *some*
earlier race record, on the reasoning that an unconfirmed large gap is
more likely a name collision than a real re-sale, and the project's own
established discipline is not to guess away data without evidence.

This excludes 254 of 24,676 rows (was 312 in the too-aggressive first
pass). **58 rows that would have been wrongly excluded are correctly
kept in the population.**

## Old vs. new numbers, by section of the PDF

Only numbers that moved by more than a rounding error are worth
re-checking by hand; most of the page barely changes. The one number
that changes meaningfully is marked.

### Page 3 — headline totals
| | Old (published PDF) | New (corrected) |
|---|---:|---:|
| Total yearlings | 24,676 | 24,422 |
| Top performers | 658 | 658 |
| Overall rate | 2.67% | 2.69% |
| "1 in N" | 1 in 38 | 1 in 37 |

Marginal — not worth re-issuing on its own.

### Page 4/6 — 8-band price table
| Band | Old | New |
|---|---:|---:|
| Under $15,000 | 0.55% (35/6,414) | 0.55% (35/6,403) |
| $15,000-$30,000 | 1.6% (111/6,924) | 1.61% (111/6,901) |
| $30,000-$50,000 | 2.5% (114/4,602) | 2.5% (114/4,569) |
| $50,000-$75,000 | 4.6% (134/2,913) | 4.68% (134/2,863) |
| $75,000-$100,000 | 4.8% (66/1,379) | 4.9% (66/1,346) |
| $100,000-$125,000 | 6.2% (58/940) | 6.37% (58/911) |
| $125,000-$150,000 | 7.6% (27/354) | 7.94% (27/340) |
| $150,000+ | 9.8% (113/1,150) | 10.38% (113/1,089) |

All marginal-to-small (largest change: $150k+, +0.58pp). None reverses
which band is highest/lowest or changes the page's stated takeaway.

### Page 4/7 — colt/filly, trotter/pacer (combined, all 3 sales)
| | Old | New |
|---|---:|---:|
| Colt | 3.3% (371/11,127) | 3.35% (371/11,077) |
| Filly | 2.3% (287/12,665) | 2.3% (287/12,501) |
| Colt share of all toppers | 56.0% | 56.4% |
| Filly share | 44.0% | 43.6% |
| Trotter | 2.9% (344/11,975) | 2.9% (344/11,848) |
| Pacer | 2.7% (314/11,803) | 2.69% (314/11,676) |

Marginal everywhere. No reversal.

### Page 8 — sex x gait x price crosstab
Every cell moves by less than 0.3pp except one: **trotter colt,
$100k-$150k**, which was already the strongest cell in that column
(9.20% -> 9.35%, still the strongest). No cell changes which is
green/highlighted.

### Page 12/13 — per-venue tables
Lexington and Ohio: **zero change anywhere** (neither sale uses Book 2,
so the fix cannot touch them — this is a useful internal consistency
check, not a coincidence).

Harrisburg: every cell moves marginally (<0.2pp) **except one**:

| Harrisburg $100k+ | Old | New |
|---|---:|---:|
| Rate | 6.95% (81 of 1,165) | **7.63%** (81 of 1,061) |
| Change | | **+0.68pp** |

This is the one number on the whole page worth actually re-checking and
re-publishing. It moved because 104 of the 1,165 horses in that specific
cell were later-confirmed-real re-sold older horses concentrated in the
priciest Harrisburg band specifically (expensive Book 2 listings are
more often already-campaigned horses being resold than expensive Book 1
listings are) — none of those 104 were ever counted as a "top performer"
in the old matching either, so they only ever diluted the denominator,
never the numerator.

Other Harrisburg cells for reference (all marginal):
| | Old | New |
|---|---:|---:|
| Under $30k | 0.74% | 0.75% |
| $30k-$50k | 1.97% | 1.99% |
| $50k-$75k | 3.10% | 3.20% |
| $75k-$100k | 3.12% | 3.26% |
| Colt | 2.37% | 2.39% |
| Filly | 1.64% | 1.68% |
| Trotter | 1.94% | 1.97% |
| Pacer | 1.95% | 1.99% |

### Page 5/10/11 — bucket simulation examples
Re-derived from the corrected 8-band rates above. **No conclusion in
this section changes** — same winning split size at every budget level
tested:

| Budget | Split | Old odds | New odds |
|---|---|---:|---:|
| $80k | 5 horses (~$16k each) | 7.7% | 7.8% |
| $80k | 4 horses (~$20k each) | 6.2% | 6.3% |
| $80k | 1 horse (~$80k) | 4.8% | 4.9% |
| $120k | 4 horses (~$30k each) | 9.6% | 9.6% |
| $120k | 2 horses (~$60k each) | 9.0% | 9.1% |

## What to actually do with this

1. **Verify independently first** — don't just trust these numbers.
   Re-run the exclusion logic below against `data/juveniq.db` yourself
   (or ask to see the full script) before touching `app.js`.
2. If confirmed, the only number that materially needs updating in the
   published PDF/page is **Harrisburg $100k+: 6.95% -> 7.63%** (page 12).
   Everything else can be refreshed too since the underlying dataset
   changed (24,676 -> 24,422 total), but no other single number is worth
   flagging as "wrong" on its own — they're all within normal rounding
   territory.
3. `build_analysis.py` should get the exclusion filter added (see logic
   below) so this stays correct if the pipeline is ever re-run.
4. Worth a short note wherever the page cites "24,676 yearlings" that
   the figure includes a small, identified correction for re-sold
   (not-actually-yearling) Book 2 horses — so a future re-run doesn't
   silently reintroduce the original number and look like a regression.

## Exact exclusion logic (for `build_analysis.py`)

```python
import re
from collections import defaultdict

def norm(name):
    if not name:
        return ""
    return re.sub(r"[^A-Z0-9]", "", name.upper())

# 1. Earliest known race season per normalized name, ANY age category
#    (2yo/3yo/aged) -- this is the "has this name ever raced by year Y" check.
tp_earliest = {}
for row in conn.execute(
    "select horse_name, season_year from top_performers where age_category in ('2yo','3yo','aged')"
):
    key = norm(row["horse_name"])
    if key not in tp_earliest or row["season_year"] < tp_earliest[key]:
        tp_earliest[key] = row["season_year"]

# 2. All sale_results appearances per normalized name, ACROSS ALL YEARS
#    (not just 2014-2023) -- needed to check sire consistency across
#    re-listings, which is the strongest available evidence of whether
#    an "already raced" flag is a genuine re-sale or a name collision.
name_to_appearances = defaultdict(list)
for row in conn.execute(
    """select sale_year, horse_name, sire from sale_results
       where status='sold' and sale_price is not null and sale_price > 0
         and sale_type in ('yearling_book1','yearling_book2','lexington_selected','ohio_jug')"""
):
    name_to_appearances[norm(row["horse_name"])].append((row["sale_year"], row["sire"]))

# 3. For each 2014-2023 sale row, decide whether to exclude it.
def should_exclude(sale_year, horse_name):
    key = norm(horse_name)
    earliest = tp_earliest.get(key)
    if earliest is None or earliest > sale_year:
        return False  # no prior race record -- genuine yearling, keep
    appearances = name_to_appearances.get(key, [])
    sires = set(s for _, s in appearances if s)
    if len(appearances) > 1 and len(sires) == 1:
        return True  # confirmed: same horse re-listed (consistent sire)
    gap = sale_year - earliest
    if gap <= 1:
        return True  # single appearance, small gap -- plausible same-horse resale
    return False  # large gap, unconfirmed -- likely a name collision, keep
```

Apply `should_exclude(sale_year, horse_name)` as a skip condition inside
the existing row loop in `build_analysis.py`, right after loading each
`sale_results` row and before computing `is_top_performer`.

## Full corrected numbers (all sections, for direct comparison)

See `sale_history_v2_final_results.json` in this folder (copied
alongside this handoff) for every number in machine-readable form —
overall, all 8 price bands, sex, gait, the sex x gait x price crosstab,
all 3 venues' price-band and sex/gait tables, and the bucket simulation
at all 3 budget levels. Cross-check any specific page number against
that file rather than retyping numbers by hand.
