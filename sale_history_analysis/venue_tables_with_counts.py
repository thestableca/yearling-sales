import json

with open("horses_raw.json") as f:
    horses = json.load(f)

BANDS = [
    (0, 30000, "Under $30k"),
    (30000, 50000, "$30k-$50k"),
    (50000, 75000, "$50k-$75k"),
    (75000, 100000, "$75k-$100k"),
    (100000, float("inf"), "$100k+"),
]

VENUE_LABELS = {"lexington": "Lexington Selected", "harrisburg": "Harrisburg Book 1&2", "ohio": "Ohio Jug"}

print("=== TABLE 1: venue x price band, X of Y ===")
for venue in ("lexington", "harrisburg", "ohio"):
    print(f"\n{VENUE_LABELS[venue]}:")
    total_at_venue = [h for h in horses if h["venue"] == venue]
    for lo, hi, label in BANDS:
        group = [h for h in total_at_venue if lo <= h["price_usd"] < hi]
        tp = sum(1 for h in group if h["is_top_performer"])
        n = len(group)
        rate = tp / n * 100 if n else 0
        print(f"  {label}: {tp} of {n} = {rate:.1f}%")
    print(f"  TOTAL: {len(total_at_venue)}")

print()
print("=== TABLE 2: venue x colt/filly/trotter/pacer, X of Y ===")
for venue in ("lexington", "harrisburg", "ohio"):
    print(f"\n{VENUE_LABELS[venue]}:")
    total_at_venue = [h for h in horses if h["venue"] == venue]
    for key, label in (("sex:colt", "Colt"), ("sex:filly", "Filly"), ("gait:trotter", "Trotter"), ("gait:pacer", "Pacer")):
        field, val = key.split(":")
        group = [h for h in total_at_venue if h[field] == val]
        tp = sum(1 for h in group if h["is_top_performer"])
        n = len(group)
        rate = tp / n * 100 if n else 0
        print(f"  {label}: {tp} of {n} = {rate:.1f}%")
    print(f"  TOTAL: {len(total_at_venue)}")
