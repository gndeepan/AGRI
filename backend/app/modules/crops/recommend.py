"""Transparent crop-suitability scoring (pure). Every point awarded or withheld is explained
in reasons/risks/limitations, citing this field's own numbers. Scores are planning aids,
not agronomic certification.

Each factor is scored by degree (distance from the crop's optimum), not pass/fail, so two
fields with different soil or climate rank crops differently instead of tying at 100.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from statistics import fmean

STATE_REGION = {"tamil nadu": "IN-TN"}
WEIGHTS = {"season": 30, "temperature": 20, "water": 25, "soil": 25}
IRRIGATION_SUPPLY = {"assured": None, "limited": 0.5, "rainfed": 0.0}
WATERLOGGING_MAX_PENALTY = 20
OUT_OF_SEASON_CAP = 40  # keeps "unsuitable" crops visibly below the suitable range
NEAR_WINDOW_DAYS = 15

# Neighbouring classes in the USDA texture triangle earn partial credit.
TEXTURE_NEIGHBOURS: dict[str, set[str]] = {
    "sand": {"loamy sand"},
    "loamy sand": {"sand", "sandy loam"},
    "sandy loam": {"loamy sand", "loam", "sandy clay loam"},
    "loam": {"sandy loam", "silt loam", "clay loam", "sandy clay loam"},
    "silt loam": {"loam", "silt", "silty clay loam"},
    "silt": {"silt loam"},
    "sandy clay loam": {"sandy loam", "loam", "clay loam", "sandy clay"},
    "clay loam": {"loam", "sandy clay loam", "silty clay loam", "clay"},
    "silty clay loam": {"silt loam", "clay loam", "silty clay"},
    "sandy clay": {"sandy clay loam", "clay"},
    "silty clay": {"silty clay loam", "clay"},
    "clay": {"clay loam", "sandy clay", "silty clay"},
}


@dataclass
class SiteContext:
    sowing_date: date
    irrigation: str  # assured | limited | rainfed
    region: str | None  # e.g. IN-TN
    texture: str | None = None
    ph: float | None = None
    soil_source: str | None = None  # "soil_test" | "soilgrids"
    soil_label: str | None = None  # e.g. "SoilGrids 250 m, 0–30 cm" or "your soil test of 2026-08-01"
    clay_pct: float | None = None
    sand_pct: float | None = None
    climate: dict[str, dict] | None = None  # day-of-year climatology {MM-DD: {...}}
    climate_years: int | None = None
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


@dataclass
class SeasonClimate:
    tmean: float | None
    tmax: float | None
    rain: float | None


def _season_climate(climate: dict[str, dict], start: date, days: int) -> SeasonClimate:
    tmeans, tmaxs, rain, have_rain = [], [], 0.0, False
    for i in range(days):
        d = start + timedelta(days=i)
        row = climate.get("02-28" if (d.month, d.day) == (2, 29) else d.strftime("%m-%d"))
        if not row:
            continue
        if row.get("tmean_c") is not None:
            tmeans.append(row["tmean_c"])
        if row.get("tmax_c") is not None:
            tmaxs.append(row["tmax_c"])
        if row.get("precipitation_mm") is not None:
            rain += row["precipitation_mm"]
            have_rain = True
    return SeasonClimate(
        tmean=round(fmean(tmeans), 1) if tmeans else None,
        tmax=round(fmean(tmaxs), 1) if tmaxs else None,
        rain=round(rain) if have_rain else None,
    )


def _clim_label(ctx: SiteContext) -> str:
    return f"{ctx.climate_years}-yr climatology" if ctx.climate_years else "climatology"


def _span(start: date, days: int) -> str:
    end = start + timedelta(days=days)
    return f"{start:%b}–{end:%b}" if start.month != end.month else f"{start:%b}"


def _season_score(crop: dict, ctx: SiteContext, seasons: dict[str, dict], out: dict) -> tuple[float, bool]:
    data = crop["data"]
    rules = [r for r in crop.get("rules", []) if ctx.region and r["region"] == ctx.region]
    if not rules:
        out["limitations"].append("No regional planting calendar for this location; generic season windows used.")
        rules = [{"season_key": k, "sowing_start": seasons[k]["sowing_window"]["start"],
                  "sowing_end": seasons[k]["sowing_window"]["end"]} for k in data["seasons"] if k in seasons]
    best = None
    for rule in rules:
        s, e = _window_dates(rule["sowing_start"], rule["sowing_end"], ctx.sowing_date)
        gap = 0 if s <= ctx.sowing_date <= e else min(abs((ctx.sowing_date - s).days), abs((ctx.sowing_date - e).days))
        if best is None or gap < best[0]:
            best = (gap, rule, s, e)
    if best is None:
        return 0.0, False
    gap, rule, s, e = best
    season = seasons.get(rule["season_key"])
    out["season"] = season
    out["sowing_window"] = {"start": s.isoformat(), "end": e.isoformat()}
    name = season["name"]["en"] if season else rule["season_key"]
    w = WEIGHTS["season"]
    if gap == 0:
        half = max(1.0, (e - s).days / 2)
        centre = s + timedelta(days=half)
        centrality = max(0.0, 1 - abs((ctx.sowing_date - centre).days) / half)
        into = (ctx.sowing_date - s).days
        out["reasons"].append(
            f"Sowing on {ctx.sowing_date:%d %b} is day {into + 1} of the {name} window ({s:%d %b}–{e:%d %b}).")
        return w * (0.8 + 0.2 * centrality), False
    if gap <= NEAR_WINDOW_DAYS:
        out["risks"].append(f"Sowing is {gap} days outside the {name} window ({s:%d %b}–{e:%d %b}).")
        return w * 0.5 * (1 - gap / (2 * NEAR_WINDOW_DAYS)), False
    out["risks"].append(f"Sowing date is outside the usual seasons for this crop (nearest: {name}, "
                        f"{s:%d %b}–{e:%d %b}).")
    return 0.0, True


def _temperature_score(crop: dict, ctx: SiteContext, sc: SeasonClimate, days: int, out: dict) -> float | None:
    lo, hi = crop["data"]["temp_optimal_c"]
    w = WEIGHTS["temperature"]
    if sc.tmean is None:
        out["limitations"].append("Climate data unavailable; temperature suitability not assessed.")
        return None
    t = sc.tmean
    where = f"over a {days}-day season from {ctx.sowing_date:%d %b} ({_clim_label(ctx)})"
    if lo <= t <= hi:
        mid, half = (lo + hi) / 2, max(0.5, (hi - lo) / 2)
        out["reasons"].append(f"Typical mean temperature {where} is ~{t} °C, within the crop's {lo}–{hi} °C.")
        score = w * (0.75 + 0.25 * (1 - abs(t - mid) / half))
    else:
        d = lo - t if t < lo else t - hi
        edge = "near the edge of" if d <= 3 else "outside"
        out["risks"].append(f"Typical mean temperature {where} is ~{t} °C, {edge} the crop's {lo}–{hi} °C.")
        score = max(0.0, w * 0.75 - 5 * d)
    if sc.tmax is not None and sc.tmax >= hi + 3:
        out["risks"].append(f"Typical daily maximum over the season is ~{sc.tmax} °C; heat stress is likely "
                            "around flowering.")
        score -= 2
    return max(0.0, score)


def _water_score(crop: dict, ctx: SiteContext, sc: SeasonClimate, days: int, out: dict) -> tuple[float | None, bool]:
    data = crop["data"]
    req_lo, req_hi = data["water_requirement_mm"]
    w = WEIGHTS["water"]
    factor = IRRIGATION_SUPPLY.get(ctx.irrigation, 0.0)
    rain = sc.rain
    rain_txt = (f"~{rain} mm typical rain over {_span(ctx.sowing_date, days)} ({_clim_label(ctx)})"
                if rain is not None else None)
    hard_fail = False
    if factor is None:
        score = float(w)
        note = f"; {rain_txt}" if rain_txt else ""
        out["reasons"].append(f"Assured irrigation can meet the crop's ~{req_lo}–{req_hi} mm water need{note}.")
    elif rain is None:
        out["limitations"].append("Seasonal rainfall estimate unavailable; water balance not assessed.")
        return None, False
    else:
        supply = rain + factor * req_lo
        ratio = supply / req_lo
        score = w * min(1.0, ratio) ** 1.5
        source = "rain plus limited irrigation" if factor else "rain alone (rainfed)"
        if ratio >= 1:
            out["reasons"].append(f"{rain_txt[0].upper()}{rain_txt[1:]}; {source} can meet the ~{req_lo} mm "
                                  "minimum need.")
        elif ratio >= 0.7:
            out["risks"].append(f"Water may be short: {rain_txt} vs ~{req_lo} mm minimum need.")
        else:
            out["risks"].append(f"Insufficient water: {rain_txt} vs ~{req_lo}–{req_hi} mm need.")
            hard_fail = data.get("water_need") == "high"
    if rain is not None:
        excess = rain / req_hi
        if data.get("water_need") != "high" and excess > 1:
            score -= min(WATERLOGGING_MAX_PENALTY, (excess - 1) * 25)
            if excess >= 1.25:
                heavy = ctx.clay_pct is not None and ctx.clay_pct >= 40
                soil_note = f" on this heavy soil ({ctx.clay_pct:.0f} % clay)" if heavy else " unless the field drains well"
                out["risks"].append(f"Typical season rainfall (~{rain} mm) is well above the crop's ~{req_hi} mm "
                                    f"need; waterlogging risk{soil_note}.")
        out["limitations"].append("Rainfall is a multi-year average; individual seasons vary widely.")
    return score, hard_fail


def _soil_score(crop: dict, ctx: SiteContext, out: dict) -> float | None:
    data = crop["data"]
    if ctx.texture is None and ctx.ph is None:
        out["limitations"].append("No soil data for this field (the 250 m soil model has no estimate here). "
                                  "Add a soil test to assess soil suitability.")
        return None
    src = ctx.soil_label or ("your soil test" if ctx.soil_source == "soil_test" else "SoilGrids estimate (250 m, modelled)")
    score = 0.0
    if ctx.texture is not None:
        parts = []
        if ctx.clay_pct is not None:
            parts.append(f"clay {ctx.clay_pct:.0f} %")
        if ctx.sand_pct is not None:
            parts.append(f"sand {ctx.sand_pct:.0f} %")
        detail = f"{', '.join(parts)} → " if parts else ""
        suitable = data["suitable_textures"]
        if ctx.texture in suitable:
            score += 15
            out["reasons"].append(f"Soil ({src}): {detail}'{ctx.texture}', which suits this crop.")
        elif TEXTURE_NEIGHBOURS.get(ctx.texture, set()) & set(suitable):
            score += 10
            out["risks"].append(f"Soil ({src}): {detail}'{ctx.texture}' is close to, but not among, the textures "
                                f"this crop prefers ({', '.join(suitable)}).")
        else:
            score += 4
            out["risks"].append(f"Soil ({src}): {detail}'{ctx.texture}' is not ideal for this crop "
                                f"(prefers {', '.join(suitable)}).")
    else:
        score += 7.5
    if ctx.ph is not None:
        plo, phi = data["ph_range"]
        if plo <= ctx.ph <= phi:
            mid, half = (plo + phi) / 2, max(0.25, (phi - plo) / 2)
            score += 7 + 3 * (1 - abs(ctx.ph - mid) / half)
            out["reasons"].append(f"Soil pH {ctx.ph} ({src}) is within the crop's {plo}–{phi}.")
        else:
            d = plo - ctx.ph if ctx.ph < plo else ctx.ph - phi
            score += max(0.0, 7 * (1 - d))
            word = "slightly outside" if d <= 0.5 else "outside"
            out["risks"].append(f"Soil pH {ctx.ph} ({src}) is {word} the crop's {plo}–{phi}.")
    else:
        score += 5
    if ctx.soil_source != "soil_test":
        out["limitations"].append("Soil values are modelled estimates, not a laboratory test of this field.")
    return score


def score_crop(crop: dict, ctx: SiteContext, seasons: dict[str, dict]) -> dict:
    data = crop["data"]
    out: dict = {"reasons": [], "risks": [], "limitations": [], "season": None, "sowing_window": None}

    s_season, fail_season = _season_score(crop, ctx, seasons, out)
    days = round(fmean(data["duration_days"]))
    sc = _season_climate(ctx.climate, ctx.sowing_date, days) if ctx.climate else SeasonClimate(None, None, None)
    s_temp = _temperature_score(crop, ctx, sc, days, out)
    s_water, fail_water = _water_score(crop, ctx, sc, days, out)
    s_soil = _soil_score(crop, ctx, out)

    season = out["season"]
    if crop["slug"] == "paddy" and season:
        names = [v["name"] for v in crop.get("varieties", [])
                 if season["key"] in v.get("seasons", []) and v.get("verified", True)]
        if names:
            more = f" and {len(names) - 6} more" if len(names) > 6 else ""
            out["reasons"].append(f"Varieties commonly listed for {season['name']['en']}: "
                                  f"{', '.join(names[:6])}{more}.")

    hard_fail = fail_season or fail_water
    # Factors we could not assess are left out and the rest rescaled, never filled with a default.
    parts = {"season": s_season, "temperature": s_temp, "water": s_water, "soil": s_soil}
    assessed = {k: v for k, v in parts.items() if v is not None}
    unassessed = [k for k, v in parts.items() if v is None]
    raw = sum(assessed.values()) / sum(WEIGHTS[k] for k in assessed) * 100.0
    raw = max(0.0, min(raw, OUT_OF_SEASON_CAP if hard_fail else 100.0))
    score = round(raw)
    risks = out["risks"]
    if hard_fail or score < 45:
        suitability = "unsuitable"
    elif score >= 70 and len(risks) <= 1:
        suitability = "suitable"
    else:
        suitability = "marginal"
    data_complete = not unassessed
    confidence = ("data_backed" if crop.get("confidence") == "data_backed" and ctx.region and data_complete
                  else "preliminary")
    return {
        "crop_slug": crop["slug"], "score": score, "score_raw": round(raw, 2), "suitability": suitability,
        "confidence": confidence, "season": season, "sowing_window": out["sowing_window"],
        "score_breakdown": {k: (round(v, 1) if v is not None else None) for k, v in parts.items()},
        "unassessed": unassessed,
        "season_climate": {"days": days, "tmean_c": sc.tmean, "tmax_c": sc.tmax, "rain_mm": sc.rain},
        "reasons": out["reasons"], "risks": risks, "limitations": out["limitations"],
        "inputs_used": ctx.provenance,
    }


def recommend(crops: list[dict], ctx: SiteContext, seasons: dict[str, dict]) -> list[dict]:
    results = [score_crop(c, ctx, seasons) for c in crops]
    order = {"suitable": 0, "marginal": 1, "unsuitable": 2}
    return sorted(results, key=lambda r: (order[r["suitability"]], -r["score_raw"], r["crop_slug"]))
