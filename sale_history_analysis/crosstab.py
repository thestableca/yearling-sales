import json

with open("horses_raw.json") as f:
    horses = json.load(f)

# Re-indexed 2026-09-07 alongside price_bands.py, denser in TheStable's
# realistic buying range (see that file's comment).
BANDS = [
    (0, 30000, "Under $30k"),
    (30000, 50000, "$30k-$50k"),
    (50000, 75000, "$50k-$75k"),
    (75000, 100000, "$75k-$100k"),
    (100000, 150000, "$100k-$150k"),
    (150000, float("inf"), "$150k+"),
]

print("=== Sex x Gait crosstab per price band (top-performer rate) ===")
for lo, hi, label in BANDS:
    in_band = [h for h in horses if lo <= h["price_usd"] < hi]
    print(f"\n{label} (n={len(in_band)}):")
    for sex in ("colt", "filly"):
        for gait in ("pacer", "trotter"):
            group = [h for h in in_band if h["sex"] == sex and h["gait"] == gait]
            if not group:
                continue
            tp = sum(1 for h in group if h["is_top_performer"])
            rate = tp / len(group) * 100
            print(f"  {sex} {gait}: {tp}/{len(group)} = {rate:.2f}%")

print()
print("=== Overall colt vs filly, pacer vs trotter (independent of price) ===")
for sex in ("colt", "filly"):
    group = [h for h in horses if h["sex"] == sex]
    tp = sum(1 for h in group if h["is_top_performer"])
    print(f"{sex}: {tp}/{len(group)} = {tp/len(group)*100:.2f}%")
for gait in ("pacer", "trotter"):
    group = [h for h in horses if h["gait"] == gait]
    tp = sum(1 for h in group if h["is_top_performer"])
    print(f"{gait}: {tp}/{len(group)} = {tp/len(group)*100:.2f}%")

total_tp = sum(1 for h in horses if h["is_top_performer"])
colt_share = sum(1 for h in horses if h["is_top_performer"] and h["sex"] == "colt") / total_tp * 100
filly_share = sum(1 for h in horses if h["is_top_performer"] and h["sex"] == "filly") / total_tp * 100
pacer_share = sum(1 for h in horses if h["is_top_performer"] and h["gait"] == "pacer") / total_tp * 100
trotter_share = sum(1 for h in horses if h["is_top_performer"] and h["gait"] == "trotter") / total_tp * 100
print(f"\nShare of ALL top performers that are colts: {colt_share:.1f}%, fillies: {filly_share:.1f}%")
print(f"Share of ALL top performers that are pacers: {pacer_share:.1f}%, trotters: {trotter_share:.1f}%")

# Venue x price cross (does the pattern hold at each individual sale?)
print()
print("=== Per-venue price band rates (does pattern hold at each sale individually?) ===")
for venue in ("lexington", "harrisburg", "ohio"):
    print(f"\n{venue}:")
    for lo, hi, label in BANDS:
        group = [h for h in horses if h["venue"] == venue and lo <= h["price_usd"] < hi]
        if not group:
            print(f"  {label}: no data")
            continue
        tp = sum(1 for h in group if h["is_top_performer"])
        print(f"  {label}: {tp}/{len(group)} = {tp/len(group)*100:.2f}%")
