"""Pure-function demo data generator: generate_day(target_date, seed, overrides)
always returns the same output for the same inputs. See PROJECT.md →
"Generation algorithm" / "Time Machine" for the design this implements.
"""

import random
from datetime import date

from app.demo import profile
from app.demo.markov import resolve_state_sequence, stable_seed

STATE_MULTIPLIERS = {"good": 1.4, "bad": 0.6, "standstill": 1.0}
CPC_STATE_MULTIPLIERS = {"good": 0.9, "bad": 1.2, "standstill": 1.0}
WEEKEND_MULTIPLIER = 1.15
VOLATILE_RANGE = (0.5, 1.6)


def _entity_rng(seed: int, day: date, entity_key: str) -> random.Random:
    return random.Random(stable_seed(seed, day.isoformat(), entity_key))


def _state_multiplier(state: str, seed: int, day: date, entity_key: str) -> float:
    if state == "volatile":
        return _entity_rng(seed, day, entity_key).uniform(*VOLATILE_RANGE)
    return STATE_MULTIPLIERS[state]


def _decline_multiplier(campaign_key: str, day_offset: int) -> float:
    if campaign_key != profile.DECLINING_CAMPAIGN:
        return 1.0
    start, duration = profile.DECLINE_START_DAY, profile.DECLINE_DURATION_DAYS
    if day_offset < start:
        return 1.0
    progress = min(1.0, (day_offset - start) / duration)
    return 1.0 - progress * profile.DECLINE_TOTAL_DROP


def _seasonal_spike_multiplier(day_offset: int) -> float:
    start, duration = profile.SEASONAL_SPIKE_START_DAY, profile.SEASONAL_SPIKE_DURATION_DAYS
    if start <= day_offset < start + duration:
        return profile.SEASONAL_SPIKE_MULTIPLIER
    return 1.0


def _split_conserving_total(total: float, shares: dict, boosted_key: str, boost: float) -> dict:
    """Split `total` across `shares` proportionally, then boost one key's
    share and pull the difference from the others (proportionally), so the
    parts still sum to `total` exactly."""
    base = {k: total * s for k, s in shares.items()}
    if boost == 1.0 or boosted_key not in base:
        return base
    boosted_value = base[boosted_key] * boost
    extra = boosted_value - base[boosted_key]
    others_total = sum(v for k, v in base.items() if k != boosted_key)
    result = {boosted_key: boosted_value}
    for k, v in base.items():
        if k == boosted_key:
            continue
        reduction = extra * (v / others_total) if others_total > 0 else 0
        result[k] = max(0.0, v - reduction)
    return result


def generate_day(target_date: date, seed: int = 0, overrides: dict | None = None) -> dict:
    overrides = overrides or {}
    states = resolve_state_sequence(profile.START_DATE, target_date, seed, overrides)
    state = states[target_date]
    day_offset = (target_date - profile.START_DATE).days
    weekday_mult = WEEKEND_MULTIPLIER if target_date.weekday() >= 5 else 1.0
    spike_mult = _seasonal_spike_multiplier(day_offset)

    campaigns_out = []
    segments_out = []

    for c in profile.CAMPAIGNS:
        base_mult = _state_multiplier(state, seed, target_date, c["key"])
        sensitivity_mult = 1 + (base_mult - 1) * c["sensitivity"]
        decline_mult = _decline_multiplier(c["key"], day_offset)
        noise = _entity_rng(seed, target_date, c["key"] + ":noise").uniform(0.92, 1.08)
        final_mult = sensitivity_mult * weekday_mult * decline_mult * spike_mult * noise

        impressions = round(profile.BASELINE_IMPRESSIONS * c["weight"] * final_mult)
        clicks = round(profile.BASELINE_CLICKS * c["weight"] * final_mult)
        conversions = round(profile.BASELINE_CONVERSIONS * c["weight"] * final_mult, 2)

        cpc_mult = CPC_STATE_MULTIPLIERS.get(state, 1.0) if state != "volatile" else base_mult
        cost_micros = round(clicks * profile.BASELINE_CPC_MICROS * cpc_mult)

        campaigns_out.append({
            "campaign_key": c["key"],
            "impressions": impressions,
            "clicks": clicks,
            "cost_micros": cost_micros,
            "conversions": conversions,
        })

        # Device breakdown — every campaign.
        device_shares = {d["value"]: d["share"] for d in profile.DEVICES}
        for field, total in (("impressions", impressions), ("clicks", clicks), ("cost_micros", cost_micros)):
            split = _split_conserving_total(total, device_shares, "", 1.0)
            for value, amount in split.items():
                segments_out.append({
                    "campaign_key": c["key"], "segment_type": "device", "segment_value": value,
                    "_field": field, "_amount": amount,
                })
        conv_split = _split_conserving_total(conversions, device_shares, "", 1.0)
        for value, amount in conv_split.items():
            segments_out.append({
                "campaign_key": c["key"], "segment_type": "device", "segment_value": value,
                "_field": "conversions", "_amount": amount,
            })

        # Geography breakdown — search_generic and pmax only, with the
        # deliberately outperforming suburb boosted on conversions.
        if c["key"] in profile.GEOGRAPHY_CAMPAIGNS:
            geo_shares = {g["value"]: g["share"] for g in profile.GEOGRAPHIES}
            for field, total in (("impressions", impressions), ("clicks", clicks), ("cost_micros", cost_micros)):
                split = _split_conserving_total(total, geo_shares, "", 1.0)
                for value, amount in split.items():
                    segments_out.append({
                        "campaign_key": c["key"], "segment_type": "geography", "segment_value": value,
                        "_field": field, "_amount": amount,
                    })
            boost = next(g["sensitivity_boost"] for g in profile.GEOGRAPHIES if g["value"] == profile.OUTPERFORMING_GEOGRAPHY)
            conv_split = _split_conserving_total(conversions, geo_shares, profile.OUTPERFORMING_GEOGRAPHY, boost)
            for value, amount in conv_split.items():
                segments_out.append({
                    "campaign_key": c["key"], "segment_type": "geography", "segment_value": value,
                    "_field": "conversions", "_amount": amount,
                })

        # Custom remarketing behavior segments — Display campaign only.
        if c["key"] == "display":
            remarketing_shares = {r["value"]: r["share"] for r in profile.REMARKETING_SEGMENTS}
            for field, total in (
                ("impressions", impressions), ("clicks", clicks),
                ("cost_micros", cost_micros), ("conversions", conversions),
            ):
                split = _split_conserving_total(total, remarketing_shares, "", 1.0)
                for value, amount in split.items():
                    segments_out.append({
                        "campaign_key": c["key"], "segment_type": "custom", "segment_value": value,
                        "_field": field, "_amount": amount,
                    })

    return {
        "date": target_date,
        "state": state,
        "campaigns": campaigns_out,
        "segments": _pivot_segments(segments_out),
    }


def _pivot_segments(rows: list[dict]) -> list[dict]:
    """Collapse the per-field rows emitted above into one row per
    (campaign_key, segment_type, segment_value) with all 4 metrics."""
    pivoted: dict[tuple, dict] = {}
    for r in rows:
        key = (r["campaign_key"], r["segment_type"], r["segment_value"])
        entry = pivoted.setdefault(key, {
            "campaign_key": r["campaign_key"],
            "segment_type": r["segment_type"],
            "segment_value": r["segment_value"],
            "impressions": 0, "clicks": 0, "cost_micros": 0, "conversions": 0.0,
        })
        field = r["_field"]
        amount = r["_amount"]
        entry[field] = round(amount) if field != "conversions" else round(amount, 2)
    return list(pivoted.values())
