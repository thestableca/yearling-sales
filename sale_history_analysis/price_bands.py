import json

with open("horses_raw.json") as f:
    horses = json.load(f)

# 8 price bands in USD (original sale currency). Re-indexed 2026-09-07:
# the original bands (14k/28k/50k/85k/140k/210k/280k) spent nearly half
# their range on $140k-$280k+, where TheStable rarely buys (only ~4-5% of
# all sold yearlings cost more than $120k) - denser now in the realistic
# buying range, one wide band above $150k for everything TheStable almost
# never reaches.
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

print(f"Total horses in dataset: {len(horses)}")
print()
print(f"{'Band':<22}{'Count':>8}{'Top performers':>16}{'Rate':>8}")
for lo, hi, label in BANDS:
    in_band = [h for h in horses if lo <= h["price_usd"] < hi]
    tp_count = sum(1 for h in in_band if h["is_top_performer"])
    rate = (tp_count / len(in_band) * 100) if in_band else 0
    print(f"{label:<22}{len(in_band):>8}{tp_count:>16}{rate:>7.2f}%")

print()
overall_tp = sum(1 for h in horses if h["is_top_performer"])
print(f"Overall: {overall_tp} of {len(horses)} = {overall_tp/len(horses)*100:.2f}%")

# Sex breakdown among top performers
print()
sexes = {}
for h in horses:
    if h["is_top_performer"]:
        sexes[h["sex"]] = sexes.get(h["sex"], 0) + 1
print("Sex breakdown among top performers:", sexes)

# Gait breakdown among top performers
gaits = {}
for h in horses:
    if h["is_top_performer"]:
        gaits[h["gait"]] = gaits.get(h["gait"], 0) + 1
print("Gait breakdown among top performers:", gaits)

# Per-venue breakdown
print()
venues = {}
for h in horses:
    venues.setdefault(h["venue"], {"total": 0, "tp": 0})
    venues[h["venue"]]["total"] += 1
    if h["is_top_performer"]:
        venues[h["venue"]]["tp"] += 1
for v, d in venues.items():
    print(f"{v}: {d['tp']} of {d['total']} = {d['tp']/d['total']*100:.2f}%")
