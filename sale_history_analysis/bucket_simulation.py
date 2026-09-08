import json

with open("horses_with_cad.json") as f:
    horses = json.load(f)

# Re-indexed 2026-09-07 alongside price_bands.py, denser in TheStable's
# realistic buying range (see that file's comment).
BANDS = [
    (0, 15000, 0.0055),
    (15000, 30000, 0.0160),
    (30000, 50000, 0.0248),
    (50000, 75000, 0.0460),
    (75000, 100000, 0.0479),
    (100000, 125000, 0.0617),
    (125000, 150000, 0.0763),
    (150000, float("inf"), 0.0983),
]

def rate_for_price(usd_price):
    for lo, hi, rate in BANDS:
        if lo <= usd_price < hi:
            return rate
    return BANDS[-1][2]

def odds_at_least_one(per_horse_rate, n_horses):
    # P(at least one top performer) = 1 - P(none)^n, assuming independence
    return 1 - (1 - per_horse_rate) ** n_horses

# Budget scenarios re-picked 2026-09-07 to match TheStable's realistic
# buying range (was $60,714/$121,429/$150,000 USD, drawn from a budget
# example that didn't reflect real behavior) - see price_bands.py's comment.
print("=== Bucket simulation: same total budget, split N ways ===")
for total_usd, label in [(40000, "$40k USD budget"), (80000, "$80k USD budget"), (120000, "$120k USD budget")]:
    print(f"\n{label} (~${total_usd:,} USD total):")
    for n in [1, 2, 3, 4, 5]:
        per_horse = total_usd / n
        rate = rate_for_price(per_horse)
        odds = odds_at_least_one(rate, n) * 100
        print(f"  {n} horse{'s' if n > 1 else ''}, ~${per_horse:,.0f} USD each: {odds:.1f}% odds of at least 1 top performer (per-horse rate {rate*100:.2f}%)")
