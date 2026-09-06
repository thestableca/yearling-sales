import json

# Bank of Canada annual average USD/CAD rates (CAD per 1 USD), confirmed
# via web research earlier in this session. Only years 2014-2023 matter
# for this analysis (the confirmed trainable/scoreable window).
ANNUAL_RATES = {
    2014: 1.1045,
    2015: 1.2787,
    2016: 1.3248,
    2017: 1.2986,
    2018: 1.2957,
    2019: 1.3269,
    2020: 1.3415,
    2021: 1.2535,
    2022: 1.3013,
    2023: 1.3497,
}

with open("horses_raw.json") as f:
    horses = json.load(f)

for h in horses:
    rate = ANNUAL_RATES[h["sale_year"]]
    h["price_cad"] = round(h["price_usd"] * rate)

with open("horses_with_cad.json", "w") as f:
    json.dump(horses, f)

# Sanity check: what would the OLD single-rate (1.40) conversion have
# said for the same USD figure, vs. the new correct per-year figure —
# to quantify how wrong the old approach was.
print("Comparing old flat-1.40 conversion vs correct per-year conversion for a $100,000 USD sale:")
for year in range(2014, 2024):
    old_cad = 100000 * 1.40
    new_cad = 100000 * ANNUAL_RATES[year]
    diff_pct = (old_cad - new_cad) / new_cad * 100
    print(f"  {year}: old={old_cad:,.0f} CAD, correct={new_cad:,.0f} CAD, old was {diff_pct:+.1f}% off")
