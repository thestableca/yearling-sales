"""
Recomputes the "top performer by age" table (2014-2022 window only, since
confirming "top performer at 4+" needs the age-4 season fully closed).
Uses juveniq.db directly (not horses_raw.json, which doesn't carry
per-horse age-of-top-performer data) with the same Book 2 exclusion rule
as build_analysis.py. See HANDOFF_BOOK2_CORRECTION.md.

Matching methodology reverse-engineered 2026-09-15 (the original script
that built this table wasn't preserved in this project) by testing
several candidate rules against the currently-published page's exact
percentages across all 5 price columns until one matched precisely:
  - "at 2": top_performers entry in EXACTLY season sale_year+1, age_category='2yo'
  - "at 3": top_performers entry in EXACTLY season sale_year+2, age_category='3yo'
  - "at 4+": top_performers entry in EXACTLY season sale_year+3, age_category='aged'
Each row is an INDEPENDENT check (a horse can count in more than one row
if, e.g., it appears as a topper both at 2 and again later - the rows
answer "how often did a horse in this price group show up as a topper
at this specific age", not "what was the horse's first-ever topper age").
Confirmed exact match (to the published 1-decimal rounding) against all
15 cells of the previously-published table before trusting this for the
corrected numbers.
"""
import sqlite3
import sys
sys.path.insert(0, ".")
from build_analysis import normalize_name, load_exclusion_checker

DB_PATH = "/Users/RobertSikkema_1/Documents/juveniq/data/juveniq.db"

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

should_exclude = load_exclusion_checker(conn)

tp_by_name = {}
for row in conn.execute(
    "select horse_name, season_year, age_category from top_performers where age_category in ('2yo','3yo','aged')"
):
    key = normalize_name(row["horse_name"])
    tp_by_name.setdefault(key, {})[row["season_year"]] = row["age_category"]

rows = conn.execute(
    """select sale_year, sale_type, horse_name, sale_price from sale_results
       where status='sold' and sale_price is not null and sale_price > 0
         and sale_type in ('yearling_book1','yearling_book2','lexington_selected','ohio_jug')
         and sale_year between 2014 and 2022"""
).fetchall()

BANDS = [
    (0, 30000, "Under $30k"),
    (30000, 50000, "$30k-$50k"),
    (50000, 75000, "$50k-$75k"),
    (75000, 100000, "$75k-$100k"),
    (100000, float("inf"), "$100k+"),
]

def at2(sale_year, name):
    key = normalize_name(name)
    return tp_by_name.get(key, {}).get(sale_year + 1) == "2yo"

def at3(sale_year, name):
    key = normalize_name(name)
    return tp_by_name.get(key, {}).get(sale_year + 2) == "3yo"

def at4(sale_year, name):
    key = normalize_name(name)
    return tp_by_name.get(key, {}).get(sale_year + 3) == "aged"

kept = [r for r in rows if not should_exclude(r["sale_year"], r["horse_name"])]
print(f"Total 2014-2022 kept (after Book2 exclusion): {len(kept)}")
print()
for lo, hi, label in BANDS:
    group = [r for r in kept if lo <= r["sale_price"] < hi]
    n = len(group)
    c2 = sum(1 for r in group if at2(r["sale_year"], r["horse_name"]))
    c3 = sum(1 for r in group if at3(r["sale_year"], r["horse_name"]))
    c4 = sum(1 for r in group if at4(r["sale_year"], r["horse_name"]))
    print(f"{label} (n={n}): at2={c2} ({c2/n*100:.1f}%), at3={c3} ({c3/n*100:.1f}%), at4+={c4} ({c4/n*100:.1f}%)")

conn.close()
