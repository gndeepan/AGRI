"""Transparent crop-suitability scoring (pure). Every point awarded or withheld is explained
in reasons/risks/limitations. Scores are planning aids, not agronomic certification."""

from dataclasses import dataclass, field
from datetime import date, timedelta
from statistics import fmean

STATE_REGION = {"tamil nadu": "IN-TN"}
WEIGHTS = {"season": 30, "temperature": 20, "water": 25, "soil": 25}
IRRIGATION_SUPPLY = {"assured": None, "limited": 0.5, "rainfed": 0.0}
WATERLOGGING_RATIO = 1.5  # season rain above 1.5x the crop's upper water need
WATERLOGGING_PENALTY = 20
OUT_OF_SEASON_CAP = 40  # keeps "unsuitable" crops visibly below the suitable range


@dataclass
class SiteContext:
    sowing_date: date
    irrigation: str  # assured | limited | rainfed
    region: str | None  # e.g. IN-TN
    texture: str | None = None
    ph: float | None = None
    soil_source: str | None = None  # "soil_test" | "soilgrids"
    climate: dict[str, dict] | None = None  # day-of-year climatology {MM-DD: {...}}
    provenance: dict[str, dict] = field(default_factory=dict)


def region_for_state(state: str | None) -> str | None:
    return STATE_REGION.get((state or "").strip().lower())


def _window_dates(start_md: str, end_md: str, around: date) -> tuple[date, date]:
    """Concrete window for MM-DD strings closest to `around`; handles windows crossing new year."""
    candidates = []
    for year in (around.year - 1, around.year, around.year + 1):
        s = date(year, int(start_md[:2]), int(start_md[3:]))
        e = date(year, int(end_md[:2]), int(end_md[3:]))
        if e < s:
            e = date(year + 1, e.month, e.day)
        candidates.append((s, e))

    def distance(w: tuple[date, date]) -> int:
        s, e = w
        if s <= around <= e:
            return 0
        return min(abs((around - s).days), abs((around - e).days))

    return min(candidates, key=distance)


def _season_climate(climate: dict[str, dict], start: date, days: int) -> tuple[float | None, float | None]:
    temps, rain = [], 0.0
    have_rain = False
    for i in range(days):
        d = start + timedelta(days=i)
        row = climate.get("02-28" if (d.month, d.day) == (2, 29) else d.strftime("%m-%d"))
        if not row:
            continue
        if row.get("tmean_c") is not None:
            temps.append(row["tmean_c"])
        if row.get("precipitation_mm") is not None:
            rain += row["precipitation_mm"]
            have_rain = True
    return (round(fmean(temps), 1) if temps else None), (round(rain) if have_rain else None)


def score_crop(crop: dict, ctx: SiteContext, seasons: dict[str, dict]) -> dict:
    data = crop["data"]
    reasons: list[str] = []
    risks: list[str] = []
    limitations: list[str] = []
    score = 0.0
    hard_fail = False

    # --- season (regional rule windows, else generic crop seasons) ---
    rules = [r for r in crop.get("rules", []) if ctx.region and r["region"] == ctx.region]
    if not rules:
        limitations.append("No regional planting calendar for this location; generic season windows used.")
        rules = [{"season_key": k, "sowing_start": seasons[k]["sowing_window"]["start"],
                  "sowing_end": seasons[k]["sowing_window"]["end"]} for k in data["seasons"] if k in seasons]
    best = None
    for rule in rules:
        s, e = _window_dates(rule["sowing_start"], rule["sowing_end"], ctx.sowing_date)
        gap = 0 if s <= ctx.sowing_date <= e else min(abs((ctx.sowing_date - s).days), abs((ctx.sowing_date - e).days))
        if best is None or gap < best[0]:
            best = (gap, rule, s, e)
    season = window = None
    if best is not None:
        gap, rule, s, e = best
        season = seasons.get(rule["season_key"])
        window = {"start": s.isoformat(), "end": e.isoformat()}
        season_name = season["name"]["en"] if season else rule["season_key"]
        if gap == 0:
            score += WEIGHTS["season"]
            reasons.append(f"Sowing date falls in the {season_name} window ({s:%d %b}–{e:%d %b}).")
        elif gap <= 15:
            score += WEIGHTS["season"] / 2
            risks.append(f"Sowing is {gap} days outside the {season_name} window ({s:%d %b}–{e:%d %b}).")
        else:
            risks.append(f"Sowing date is outside the usual seasons for this crop (nearest: {season_name}).")
            hard_fail = True

    # --- duration-weighted climate ---
    dur = round(fmean(data["duration_days"]))
    tmean, rain = (None, None)
    if ctx.climate:
        tmean, rain = _season_climate(ctx.climate, ctx.sowing_date, dur)
    lo, hi = data["temp_optimal_c"]
    if tmean is None:
        score += WEIGHTS["temperature"] / 2
        limitations.append("Climate data unavailable; temperature suitability not assessed.")
    elif lo <= tmean <= hi:
        score += WEIGHTS["temperature"]
        reasons.append(f"Typical mean temperature over the season (~{tmean} °C) is within {lo}–{hi} °C.")
    elif lo - 3 <= tmean <= hi + 3:
        score += WEIGHTS["temperature"] / 2
        risks.append(f"Typical mean temperature (~{tmean} °C) is near the edge of {lo}–{hi} °C.")
    else:
        risks.append(f"Typical mean temperature (~{tmean} °C) is outside {lo}–{hi} °C.")

    # --- water ---
    req_lo, req_hi = data["water_requirement_mm"]
    factor = IRRIGATION_SUPPLY.get(ctx.irrigation, 0.0)
    if factor is None:
        score += WEIGHTS["water"]
        rain_note = f" (typical season rainfall ~{rain} mm)" if rain is not None else ""
        reasons.append(f"Assured irrigation can meet the crop's ~{req_lo}–{req_hi} mm water need{rain_note}.")
    elif rain is None:
        score += WEIGHTS["water"] / 3
        limitations.append("Seasonal rainfall estimate unavailable; water balance not assessed.")
    else:
        supply = rain + factor * req_lo
        if supply >= req_lo:
            score += WEIGHTS["water"]
            reasons.append(f"Typical season rainfall (~{rain} mm) plus available irrigation can meet ~{req_lo} mm need.")
        elif supply >= 0.7 * req_lo:
            score += WEIGHTS["water"] / 2
            risks.append(f"Water may be short: ~{rain} mm typical rain vs ~{req_lo} mm minimum need.")
        else:
            risks.append(f"Insufficient water: ~{rain} mm typical rain vs ~{req_lo}–{req_hi} mm need.")
            hard_fail = data.get("water_need") == "high"
    if rain is not None:
        # Excess rain matters for upland crops even when irrigation is assured.
        if data.get("water_need") != "high" and rain > WATERLOGGING_RATIO * req_hi:
            score -= WATERLOGGING_PENALTY
            risks.append(f"Typical season rainfall (~{rain} mm) is well above the crop's ~{req_hi} mm need; "
                         "waterlogging risk unless the field drains well.")
        limitations.append("Rainfall is a multi-year average; individual seasons vary widely.")

    # --- soil ---
    if ctx.texture is None and ctx.ph is None:
        score += WEIGHTS["soil"] / 2
        limitations.append("No soil data; add a soil test for a better assessment.")
    else:
        src = "your soil test" if ctx.soil_source == "soil_test" else "SoilGrids estimate (250 m, modelled)"
        if ctx.texture is not None:
            if ctx.texture in data["suitable_textures"]:
                score += 15
                reasons.append(f"Soil texture '{ctx.texture}' ({src}) suits this crop.")
            else:
                score += 5
                risks.append(f"Soil texture '{ctx.texture}' ({src}) is not ideal for this crop.")
        else:
            score += 7.5
        if ctx.ph is not None:
            plo, phi = data["ph_range"]
            if plo <= ctx.ph <= phi:
                score += 10
                reasons.append(f"Soil pH {ctx.ph} ({src}) is within {plo}–{phi}.")
            elif plo - 0.5 <= ctx.ph <= phi + 0.5:
                score += 5
                risks.append(f"Soil pH {ctx.ph} is slightly outside {plo}–{phi}.")
            else:
                risks.append(f"Soil pH {ctx.ph} is outside {plo}–{phi}.")
        else:
            score += 5
        if ctx.soil_source != "soil_test":
            limitations.append("Soil values are modelled estimates, not a laboratory test of this field.")

    if crop["slug"] == "paddy" and season:
        names = [v["name"] for v in crop.get("varieties", []) if season["key"] in v.get("seasons", [])]
        if names:
            reasons.append(f"Varieties commonly listed for {season['name']['en']}: {', '.join(names)}.")

    score = round(max(0, min(score, OUT_OF_SEASON_CAP if hard_fail else 100)))
    if hard_fail or score < 45:
        suitability = "unsuitable"
    elif score >= 70 and not risks:
        suitability = "suitable"
    elif score >= 70:
        suitability = "suitable" if len(risks) <= 1 else "marginal"
    else:
        suitability = "marginal"
    data_complete = ctx.climate is not None and (ctx.texture is not None or ctx.ph is not None)
    confidence = ("data_backed" if crop.get("confidence") == "data_backed" and ctx.region and data_complete
                  else "preliminary")
    return {
        "crop_slug": crop["slug"], "score": score, "suitability": suitability, "confidence": confidence,
        "season": season, "sowing_window": window, "reasons": reasons, "risks": risks,
        "limitations": limitations, "inputs_used": ctx.provenance,
    }


def recommend(crops: list[dict], ctx: SiteContext, seasons: dict[str, dict]) -> list[dict]:
    results = [score_crop(c, ctx, seasons) for c in crops]
    order = {"suitable": 0, "marginal": 1, "unsuitable": 2}
    return sorted(results, key=lambda r: (order[r["suitability"]], -r["score"]))
