import json

with open("horses_with_cad.json") as f:
    horses = json.load(f)

BANDS = [
    (0, 14000, 0.0056),
    (14000, 28000, 0.0152),
    (28000, 50000, 0.0245),
    (50000, 85000, 0.0456),
    (85000, 140000, 0.0613),
    (140000, 210000, 0.0895),
    (210000, 280000, 0.0949),
    (280000, float("inf"), 0.1093),
]

def rate_for_price(usd_price):
    for lo, hi, rate in BANDS:
        if lo <= usd_price < hi:
            return rate
    return BANDS[-1][2]

def odds_at_least_one(per_horse_rate, n_horses):
    # P(at least one top performer) = 1 - P(none)^n, assuming independence
    return 1 - (1 - per_horse_rate) ** n_horses

# Recompute the three budget scenarios from the OLD page (85k, 170k, 210k CAD)
# in USD terms first (since price bands and rates are all keyed to USD, the
# real source currency), splitting into 1/2/3/4/5 horses.
print("=== Bucket simulation: same total budget, split N ways ===")
for total_usd, label in [(60714, "$85k CAD budget"), (121429, "$170k CAD budget"), (150000, "$210k CAD budget")]:
    print(f"\n{label} (~${total_usd:,} USD total):")
    for n in [1, 2, 3, 4, 5]:
        per_horse = total_usd / n
        rate = rate_for_price(per_horse)
        odds = odds_at_least_one(rate, n) * 100
        print(f"  {n} horse{'s' if n > 1 else ''}, ~${per_horse:,.0f} USD each: {odds:.1f}% odds of at least 1 top performer (per-horse rate {rate*100:.2f}%)")
