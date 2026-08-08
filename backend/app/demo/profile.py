"""Used-car-dealer demo profile — see dummy.md for the sourcing/reasoning.

Every number here traces back to dummy.md; change the profile there first,
then mirror it here.
"""

from datetime import date

START_DATE = date(2026, 6, 1)  # ~10 weeks of history by "today"

# Blended daily baseline across all 5 campaigns (dummy.md → Budget & Daily Volume).
BASELINE_IMPRESSIONS = 1500
BASELINE_CLICKS = 57
BASELINE_CONVERSIONS = 4.5
BASELINE_CPC_MICROS = 1_600 * 1_000_000  # ~Rp1,600, mid-point of the Rp1,200-2,000 range

# name, share of the daily baseline, sensitivity to the day's Markov state
# (see PROJECT.md → Standout Features: PMax/in-market swing hardest, Brand stays stable).
CAMPAIGNS = [
    {"key": "brand", "name": "Brand", "weight": 0.10, "sensitivity": 0.2},
    {"key": "search_generic", "name": "Search — Used Cars Generic", "weight": 0.20, "sensitivity": 0.8},
    {"key": "search_model", "name": "Search — Model + Suburb", "weight": 0.25, "sensitivity": 0.9},
    {"key": "pmax", "name": "Performance Max — Vehicle Inventory", "weight": 0.35, "sensitivity": 1.2},
    {"key": "display", "name": "Display Remarketing", "weight": 0.10, "sensitivity": 0.7},
]

# The deliberate "clear declining trend" required by PROJECT.md's synthetic
# dataset spec — applied as a linear multiplier drift on top of the Markov
# state, isolated to one campaign so it reads as a real, specific problem.
DECLINING_CAMPAIGN = "search_model"
DECLINE_START_DAY = 25         # days since START_DATE
DECLINE_DURATION_DAYS = 30
DECLINE_TOTAL_DROP = 0.35      # down to 65% of baseline by the end of the decline

# The deliberate "seasonal spike" — a short promo window, independent of state.
SEASONAL_SPIKE_START_DAY = 45
SEASONAL_SPIKE_DURATION_DAYS = 5
SEASONAL_SPIKE_MULTIPLIER = 1.6

DEVICES = [
    {"value": "Mobile", "share": 0.55},
    {"value": "Desktop", "share": 0.35},
    {"value": "Tablet", "share": 0.10},
]

# One geography deliberately outperforms — the "subtle insight": it never
# shows up in campaign-level totals, only if you drill into segment data.
GEOGRAPHIES = [
    {"value": "Bandung, ID", "share": 0.22, "sensitivity_boost": 1.6},
    {"value": "Bekasi, ID", "share": 0.18, "sensitivity_boost": 1.0},
    {"value": "Depok, ID", "share": 0.16, "sensitivity_boost": 1.0},
    {"value": "Tangerang, ID", "share": 0.16, "sensitivity_boost": 1.0},
    {"value": "Bogor, ID", "share": 0.14, "sensitivity_boost": 1.0},
    {"value": "Jakarta, ID", "share": 0.14, "sensitivity_boost": 1.0},
]
OUTPERFORMING_GEOGRAPHY = "Bandung, ID"

# Display Remarketing's own behavior segments (dummy.md → custom segment_type).
REMARKETING_SEGMENTS = [
    {"value": "Viewed VDP", "share": 0.40},
    {"value": "Started Credit App", "share": 0.20},
    {"value": "Visited Financing Page", "share": 0.25},
    {"value": "Viewed Trade-In Value", "share": 0.15},
]

# Campaigns that get a geography breakdown (kept to 2 to bound row count).
GEOGRAPHY_CAMPAIGNS = ["search_generic", "pmax"]
