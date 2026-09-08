import json

with open("horses_with_cad.json") as f:
    horses = json.load(f)

# The price BAND BOUNDARIES themselves (the $14k/$28k/$85k/etc. cutoffs)
# are round USD numbers chosen for the page's display bands - they aren't
# a single horse's price, so there's no single "correct" CAD figure for a
# boundary the way there is for an actual sale price. For DISPLAY purposes
# on the rebuilt page, convert each USD boundary using the weighted-average
# rate actually realized by sales WITHIN that band (since that's what the
# boundary is being used to describe), rather than picking an arbitrary
# single year's rate.

# Re-indexed 2026-09-07 alongside price_bands.py, denser in TheStable's
# realistic buying range (see that file's comment).
BANDS = [
    (0, 15000, "Under $15,000"),
    (15000, 30000, "$15,000-$30,000"),
    (30000, 50000, "$30,000-$50,000"),
    (50000, 75000, "$50,000-$75,000"),
    (75000, 100000, "$75,000-$100,000"),
    (100000, 125000, "$100,000-$125,000"),
    (125000, 150000, "$125,000-$150,000"),
    (150000, float("inf"), "$150,000+"),
]

print("Weighted-average CAD equivalent for each USD band boundary:")
boundaries = sorted(set([b[0] for b in BANDS] + [b[1] for b in BANDS if b[1] != float("inf")]))
for usd_boundary in boundaries:
    # Find horses priced near this boundary (within the band it starts) to get a realistic weighted rate
    nearby = [h for h in horses if abs(h["price_usd"] - usd_boundary) < 20000]
    if not nearby:
        continue
    avg_rate = sum(h["price_cad"] / h["price_usd"] for h in nearby) / len(nearby)
    cad_equiv = usd_boundary * avg_rate
    print(f"  ${usd_boundary:,.0f} USD -> ${cad_equiv:,.0f} CAD (avg rate {avg_rate:.4f}, n={len(nearby)})")

print()
print("Full price-band table (USD is the real, unchanged source data; CAD now correctly reflects the actual years those sales happened in):")
print(f"{'Band (USD)':<22}{'Count':>7}{'Top perf.':>11}{'Rate':>8}{'Band start (CAD)':>18}")
for lo, hi, label in BANDS:
    in_band = [h for h in horses if lo <= h["price_usd"] < hi]
    tp = sum(1 for h in in_band if h["is_top_performer"])
    rate = tp / len(in_band) * 100 if in_band else 0
    if lo == 0:
        cad_lo = 0
    else:
        near_lo = [h for h in horses if abs(h["price_usd"] - lo) < 20000]
        avg_rate_lo = sum(h["price_cad"] / h["price_usd"] for h in near_lo) / len(near_lo) if near_lo else 1.30
        cad_lo = lo * avg_rate_lo
    print(f"{label:<22}{len(in_band):>7}{tp:>11}{rate:>7.2f}%{cad_lo:>16,.0f}")
