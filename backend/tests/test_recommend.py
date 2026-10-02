from datetime import date

from app.modules.crops.recommend import SiteContext, recommend, region_for_state, score_crop
from app.seed.crops import CROPS, SEASONS


def crop_dict(slug: str) -> dict:
    spec = next(c for c in CROPS if c["slug"] == slug)
    rules = [{"region": r["region"], "season_key": r["season_key"],
              "sowing_start": r.get("sowing_start", SEASONS[r["season_key"]]["sowing_window"]["start"]),
              "sowing_end": r.get("sowing_end", SEASONS[r["season_key"]]["sowing_window"]["end"])}
             for r in spec["rules"]]
    return {"slug": slug, "data": spec["data"], "confidence": spec["confidence"], "rules": rules,
            "varieties": spec["varieties"]}


def climate(tmean: float, rain_per_day: float) -> dict:
    """Synthetic flat climatology for every calendar day."""
    out = {}
    for m in range(1, 13):
        for d in range(1, 32):
            out[f"{m:02d}-{d:02d}"] = {"tmean_c": tmean, "precipitation_mm": rain_per_day}
    return out


def test_region_lookup():
    assert region_for_state("Tamil Nadu") == "IN-TN"
    assert region_for_state(None) is None


def test_paddy_samba_with_full_data_is_suitable_and_data_backed():
    ctx = SiteContext(sowing_date=date(2026, 8, 15), irrigation="assured", region="IN-TN", texture="clay", ph=6.8,
                      soil_source="soilgrids", climate=climate(28, 6))
    r = score_crop(crop_dict("paddy"), ctx, SEASONS)
    assert r["suitability"] == "suitable"
    assert r["confidence"] == "data_backed"
    assert r["season"]["key"] == "samba"
    assert any("BPT 5204" in reason for reason in r["reasons"])
    assert any("modelled estimates" in lim for lim in r["limitations"])


def test_missing_soil_and_climate_is_preliminary_with_limitations():
    ctx = SiteContext(sowing_date=date(2026, 8, 15), irrigation="limited", region="IN-TN")
    r = score_crop(crop_dict("paddy"), ctx, SEASONS)
    assert r["confidence"] == "preliminary"
    assert any("No soil data" in lim for lim in r["limitations"])
    assert any("Climate data unavailable" in lim for lim in r["limitations"])


def test_rainfed_paddy_in_dry_climate_is_unsuitable():
    ctx = SiteContext(sowing_date=date(2026, 8, 15), irrigation="rainfed", region="IN-TN", texture="clay", ph=7,
                      climate=climate(28, 1))
    r = score_crop(crop_dict("paddy"), ctx, SEASONS)
    assert r["suitability"] == "unsuitable"
    assert any("Insufficient water" in risk for risk in r["risks"])


def test_navarai_window_crosses_new_year():
    ctx = SiteContext(sowing_date=date(2027, 1, 10), irrigation="assured", region="IN-TN", climate=climate(26, 3))
    r = score_crop(crop_dict("paddy"), ctx, SEASONS)
    assert r["season"]["key"] == "navarai"
    assert r["sowing_window"] == {"start": "2026-12-01", "end": "2027-01-31"}


def test_outside_region_uses_generic_windows():
    ctx = SiteContext(sowing_date=date(2026, 7, 1), irrigation="limited", region=None, climate=climate(27, 4))
    r = score_crop(crop_dict("groundnut"), ctx, SEASONS)
    assert any("generic season windows" in lim for lim in r["limitations"])
    assert r["confidence"] == "preliminary"


def test_ranking_orders_by_suitability_then_score():
    ctx = SiteContext(sowing_date=date(2026, 7, 1), irrigation="limited", region="IN-TN", texture="sandy loam", ph=6.5,
                      climate=climate(28, 3))
    results = recommend([crop_dict(c["slug"]) for c in CROPS], ctx, SEASONS)
    order = {"suitable": 0, "marginal": 1, "unsuitable": 2}
    keys = [(order[r["suitability"]], -r["score"]) for r in results]
    assert keys == sorted(keys)
    assert {r["crop_slug"] for r in results} == {c["slug"] for c in CROPS}


def test_heavy_season_rain_flags_waterlogging_for_upland_crop():
    # ~12 mm/day for the season is far above a pulse's water need (synthetic monsoon climatology).
    ctx = SiteContext(sowing_date=date(2026, 10, 2), irrigation="assured", region="IN-TN", texture="clay loam",
                      climate=climate(26, 12))
    pulse = score_crop(crop_dict("black-gram"), ctx, SEASONS)
    paddy = score_crop(crop_dict("paddy"), ctx, SEASONS)
    assert any("waterlogging" in risk for risk in pulse["risks"])
    assert not any("waterlogging" in risk for risk in paddy["risks"])
    assert pulse["score"] < paddy["score"]


def test_out_of_season_crop_score_is_capped_below_suitable_range():
    ctx = SiteContext(sowing_date=date(2026, 10, 2), irrigation="assured", region="IN-TN", texture="clay loam",
                      climate=climate(27, 3))
    r = score_crop(crop_dict("cotton"), ctx, SEASONS)
    assert r["suitability"] == "unsuitable"
    assert r["score"] < 45
