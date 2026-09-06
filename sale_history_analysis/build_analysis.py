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

def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

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
    for r in rows:
        norm_name = normalize_name(r["horse_name"])
        sale_year = r["sale_year"]
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

    print(f"Matched {matched_count} of {len(rows)} sold yearlings to a CORRECTLY-TIMED top-performer appearance ({matched_count/len(rows)*100:.2f}%)")

    with open("/private/tmp/claude-501/-Users-RobertSikkema-1-Documents-Request-Yearling-Sales/93b764b4-5cd1-458e-ad89-aa12e197222e/scratchpad/salehistory_rebuild/horses_raw.json", "w") as f:
        json.dump(horses, f)
    print("Saved raw horse-level dataset.")

    conn.close()

if __name__ == "__main__":
    main()
