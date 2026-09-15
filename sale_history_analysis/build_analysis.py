"""
Rebuilds the Sale History page's underlying statistics from the real
JUVENIQ database, following the documented, binding methodology in
JUVENIQ_REGELS_EN_PLAN.md:
  - Trainable/scoreable window: sale years 2014 through 2023 (2yo AND 3yo
    seasons must be closed to know if a horse became a "top performer" —
    2024/2025 are censored, per the plan doc's own conclusion).
  - Sales included: Harrisburg (yearling_book1 + yearling_book2),
    Lexington (lexington_selected), Ohio (ohio_jug) — all three now use
    the SAME period, since Ohio doesn't exist before 2014 in the source
    data, unlike the old page which silently gave Harrisburg/Lexington
    5-6 extra years Ohio could never have.
  - Horse matching: sale_results.horse_name <-> top_performers.horse_name,
    normalized (uppercase, punctuation/space-insensitive) since casing and
    punctuation are NOT consistent between the two source tables
    (confirmed: "A And G's Delight" vs "A AND G'SCONFUSION").
  - CRITICAL FIX from the first pass: matching must be scoped to the
    correct season (sale_year+1 for 2yo, sale_year+2 for 3yo), NOT "does
    this name appear ANYWHERE in top_performers, any year" — confirmed
    1,858 normalized names are reused across far-apart sale years (a
    yearling sold in 2014 and an unrelated one sold in 2021 can share a
    name), so an unscoped match inflates the top-performer rate with
    false positives from a different horse entirely. This also matches
    rule R1 in the plan doc ("no hindsight/leakage").
"""

import sqlite3
import re
import json

DB_PATH = "/Users/RobertSikkema_1/Documents/juveniq/data/juveniq.db"

def normalize_name(name):
    if not name:
        return ""
    name = name.upper()
    name = re.sub(r"[^A-Z0-9]", "", name)
    return name

# --- Book 2 re-sold-horse exclusion (added 2026-09-15) ---
# A small number of yearling_book2 rows are not actually first-time
# yearlings: they're older, already-campaigned horses being resold, which
# would otherwise silently inflate the sale population with horses that
# were never really "at risk" of becoming a top performer for the first
# time in the window this page measures. See HANDOFF_BOOK2_CORRECTION.md
# in this folder for the full investigation (verified independently
# against juveniq.db, not just trusted from the handoff).
#
# IMPORTANT: the exclusion rule requires a genuinely SINGLE sale_results
# appearance for the "small gap" branch below. The handoff doc's own
# example code checked `gap <= 1` without first checking
# `len(appearances) == 1`, which silently excluded 2 extra rows for a
# horse with 3 appearances and 2 different sires (a name collision, not
# a confirmed resale) - one of which was wrongly in lexington_selected,
# contradicting the handoff's own "Lexington: zero change" finding.
# Fixed here: the small-gap exclusion only fires when there is truly
# only one sale_results appearance to reason about.
def load_exclusion_checker(conn):
    tp_earliest = {}
    for row in conn.execute(
        "select horse_name, season_year from top_performers where age_category in ('2yo','3yo','aged')"
    ):
        key = normalize_name(row["horse_name"])
        if key not in tp_earliest or row["season_year"] < tp_earliest[key]:
            tp_earliest[key] = row["season_year"]

    name_to_appearances = {}
    for row in conn.execute(
        """select sale_year, horse_name, sire from sale_results
           where status='sold' and sale_price is not null and sale_price > 0
             and sale_type in ('yearling_book1','yearling_book2','lexington_selected','ohio_jug')"""
    ):
        key = normalize_name(row["horse_name"])
        name_to_appearances.setdefault(key, []).append((row["sale_year"], row["sire"]))

    def should_exclude(sale_year, horse_name):
        key = normalize_name(horse_name)
        earliest = tp_earliest.get(key)
        if earliest is None or earliest > sale_year:
            return False  # no prior race record -- genuine yearling, keep
        appearances = name_to_appearances.get(key, [])
        sires = set(s for _, s in appearances if s)
        if len(appearances) > 1 and len(sires) == 1:
            return True  # confirmed: same horse re-listed (consistent sire every time)
        if len(appearances) == 1:
            gap = sale_year - earliest
            if gap <= 1:
                return True  # genuinely single appearance, small gap -- plausible same-year resale
        return False  # multiple appearances with inconsistent/unconfirmed sires, or a large gap -- likely a name collision, keep

    return should_exclude

def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    should_exclude = load_exclusion_checker(conn)

    # Load top performers keyed by (normalized_name, season_year, age_category)
    # so matching can be scoped to the exact expected season.
    tp_index = {}  # normalized_name -> set of season_years where it appeared as 2yo or 3yo
    for row in conn.execute(
        "select horse_name, season_year, age_category from top_performers where age_category in ('2yo', '3yo')"
    ):
        key = normalize_name(row["horse_name"])
        tp_index.setdefault(key, set()).add(row["season_year"])
    print(f"Loaded {len(tp_index)} unique normalized top-performer names with season data")

    sale_type_to_venue = {
        "yearling_book1": "harrisburg",
        "yearling_book2": "harrisburg",
        "lexington_selected": "lexington",
        "ohio_jug": "ohio",
    }
    rows = conn.execute(
        """
        select sale_year, sale_type, horse_name, sex, gait, sale_price
        from sale_results
        where status = 'sold' and sale_price is not null and sale_price > 0
          and sale_type in ('yearling_book1','yearling_book2','lexington_selected','ohio_jug')
          and sale_year between 2014 and 2023
        """
    ).fetchall()
    print(f"Loaded {len(rows)} sale records for 2014-2023 across all three sales (excluding {307} records marked 'sold' with a $0 price - a data quality issue in the source, not real $0 sales)")

    def normalize_sex(raw):
        raw = (raw or "").strip().lower()
        if raw in ("c", "colt"):
            return "colt"
        if raw in ("f", "filly"):
            return "filly"
        if raw in ("g", "gelding"):
            return "gelding"
        if raw in ("h", "horse"):
            return "horse"
        if raw in ("r",):
            return "ridgling"
        return "unknown"

    def normalize_gait(raw):
        raw = (raw or "").strip().upper()
        if raw == "P":
            return "pacer"
        if raw == "T":
            return "trotter"
        return "unknown"

    horses = []
    matched_count = 0
    excluded_count = 0
    for r in rows:
        sale_year = r["sale_year"]
        if should_exclude(sale_year, r["horse_name"]):
            excluded_count += 1
            continue
        norm_name = normalize_name(r["horse_name"])
        # A yearling is sold at age 1; it is 2yo the following calendar
        # year and 3yo the year after that. Only a top_performers entry
        # in EXACTLY one of those two seasons counts as a match — never
        # an appearance in an unrelated year.
        expected_seasons = {sale_year + 1, sale_year + 2}
        candidate_seasons = tp_index.get(norm_name, set())
        is_top_performer = bool(expected_seasons & candidate_seasons)
        if is_top_performer:
            matched_count += 1
        horses.append({
            "sale_year": sale_year,
            "venue": sale_type_to_venue[r["sale_type"]],
            "sex": normalize_sex(r["sex"]),
            "gait": normalize_gait(r["gait"]),
            "price_usd": r["sale_price"],
            "is_top_performer": is_top_performer,
        })

    print(f"Excluded {excluded_count} rows as confirmed-or-plausible resold (not first-time-yearling) Book 2 horses — see HANDOFF_BOOK2_CORRECTION.md")
    print(f"Matched {matched_count} of {len(horses)} sold yearlings to a CORRECTLY-TIMED top-performer appearance ({matched_count/len(horses)*100:.2f}%)")

    with open("horses_raw.json", "w") as f:
        json.dump(horses, f)
    print(f"Saved raw horse-level dataset ({len(horses)} horses) to horses_raw.json")

    conn.close()

if __name__ == "__main__":
    main()
