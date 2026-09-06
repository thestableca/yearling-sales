# Sale History page — source analysis

These scripts recompute the statistics shown on the Sale History admin
page (`prototype_v3/app.js`, `renderSaleHistory()`), directly from the
real JUVENIQ database (`/Users/RobertSikkema_1/Documents/juveniq/data/juveniq.db`).

## Why this exists

An earlier version of this page used hardcoded numbers spanning
"2008-2025" for all three sales (Lexington, Harrisburg, Ohio) and a single
fixed CAD/USD rate for all years. Both were wrong:

- Ohio Jug has no sale data before 2014 in JUVENIQ — the 2008-2025 framing
  silently gave Lexington/Harrisburg years of extra data Ohio never had,
  comparing the three sales unfairly.
- "Became a top performer" requires a horse's 2yo AND 3yo seasons to be
  over — per JUVENIQ's own binding rules doc
  (`/Users/RobertSikkema_1/Documents/juveniq/JUVENIQ_REGELS_EN_PLAN.md`,
  section "DEEL 3"), the trainable/scoreable window is sale years 2014
  through 2023. 2024/2025 sales are censored (seasons not closed yet).
- The single fixed exchange rate applied to 18 years of historical USD
  prices was up to ~27% off for the earliest years (2014's real annual
  average rate was ~1.10, not 1.40).
- The original name-matching (sale record -> top performer) checked "did
  this name appear ANYWHERE in the top performers table," which double
  counts: 1,858 normalized horse names in this dataset are reused by an
  unrelated horse sold in a different year. Matching is now scoped to the
  correct season (sale_year+1 for 2yo, sale_year+2 for 3yo) only.

## Run order

1. `build_analysis.py` — pulls sale_results + top_performers from JUVENIQ,
   normalizes names/sex/gait, matches each sold yearling to a
   correctly-timed top-performer appearance. Writes `horses_raw.json`.
2. `cad_conversion.py` — applies the real Bank of Canada annual-average
   USD/CAD rate per sale year (not one fixed rate). Writes `horses_with_cad.json`.
3. `price_bands.py`, `crosstab.py`, `final_numbers.py`, `bucket_simulation.py`
   — compute the specific figures shown on the page (price-band rates,
   sex/gait crosstabs, bucket-split simulation), reading from
   `horses_with_cad.json`.

The two JSON output files aren't checked in (regenerate by re-running
`build_analysis.py` then `cad_conversion.py` — needs the JUVENIQ database,
which lives outside this repo).

## Re-running when JUVENIQ data updates

If JUVENIQ's sale_results or top_performers tables get more data (e.g.
2024 sales become scoreable once their 3yo season closes in 2027), re-run
this whole pipeline and manually update the numbers in
`renderSaleHistory()` in `prototype_v3/app.js` — they are NOT computed
live by the site itself, they're a point-in-time snapshot baked into the
page text, the same way the original (wrong) version was.
