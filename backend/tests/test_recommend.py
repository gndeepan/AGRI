from datetime import date

import pytest

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
    assert any("Varieties commonly listed for Samba" in reason for reason in r["reasons"])
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


ALL = [crop_dict(c["slug"]) for c in CROPS if c["data"].get("plannable", True)]


def test_two_different_fields_rank_crops_differently():
    """Synthetic fields: a heavy-clay delta in the NE monsoon vs a sandy, dry coastal plot."""
    delta = SiteContext(sowing_date=date(2026, 10, 2), irrigation="assured", region="IN-TN", texture="clay",
                        ph=7.9, clay_pct=46, sand_pct=24, soil_source="soilgrids", climate=climate(26.5, 7.5),
                        climate_years=10)
    coast = SiteContext(sowing_date=date(2026, 10, 2), irrigation="rainfed", region="IN-TN", texture="sandy loam",
                        ph=8.3, clay_pct=14, sand_pct=68, soil_source="soilgrids", climate=climate(28.5, 2.2),
                        climate_years=10)
    a = recommend(ALL, delta, SEASONS)
    b = recommend(ALL, coast, SEASONS)
    top_a = [r["crop_slug"] for r in a[:5]]
    top_b = [r["crop_slug"] for r in b[:5]]
    assert top_a != top_b
    assert a[0]["crop_slug"] == "paddy"  # assured water + clay + monsoon
    assert next(r for r in b if r["crop_slug"] == "paddy")["suitability"] == "unsuitable"  # rainfed on sand, dry
    # Scores are graded, not a block of identical 100s.
    assert len({r["score_raw"] for r in a[:8]}) >= 6


def test_reasons_cite_the_fields_own_numbers():
    ctx = SiteContext(sowing_date=date(2026, 10, 2), irrigation="limited", region="IN-TN", texture="clay loam",
                      ph=7.4, clay_pct=38, sand_pct=30, soil_source="soilgrids",
                      soil_label="SoilGrids 250 m model, 0–30 cm", climate=climate(27, 6), climate_years=10)
    r = score_crop(crop_dict("groundnut"), ctx, SEASONS)
    text = " ".join(r["reasons"] + r["risks"])
    assert "clay 38 %" in text and "sand 30 %" in text
    assert "10-yr climatology" in text
    assert "~27.0 °C" in text or "~27 °C" in text
    assert r["score_breakdown"].keys() == {"season", "temperature", "water", "soil"}


def test_temperature_scored_by_distance_not_pass_fail():
    base = dict(sowing_date=date(2026, 10, 2), irrigation="assured", region="IN-TN", texture="loam", ph=6.8)
    near = score_crop(crop_dict("maize"), SiteContext(**base, climate=climate(26.5, 3)), SEASONS)
    edge = score_crop(crop_dict("maize"), SiteContext(**base, climate=climate(31.5, 3)), SEASONS)
    hot = score_crop(crop_dict("maize"), SiteContext(**base, climate=climate(35, 3)), SEASONS)
    assert near["score_breakdown"]["temperature"] > edge["score_breakdown"]["temperature"]
    assert edge["score_breakdown"]["temperature"] > hot["score_breakdown"]["temperature"]


def test_neighbouring_texture_gets_partial_credit():
    base = dict(sowing_date=date(2026, 10, 2), irrigation="assured", region="IN-TN", ph=7.0, climate=climate(27, 3))
    crop = crop_dict("groundnut")
    good, near, far = (score_crop(crop, SiteContext(**base, texture=t), SEASONS)["score_breakdown"]["soil"]
                       for t in ("sandy loam", "clay loam", "silty clay"))
    assert good > near > far


def test_missing_soil_is_left_out_not_scored_as_a_default():
    base = dict(sowing_date=date(2026, 10, 2), irrigation="assured", region="IN-TN", climate=climate(27, 3))
    none = score_crop(crop_dict("maize"), SiteContext(**base), SEASONS)
    assert none["score_breakdown"]["soil"] is None and none["unassessed"] == ["soil"]
    assert any("No soil data" in lim for lim in none["limitations"])
    assert none["confidence"] == "preliminary"
    # Not a hidden mid-point: the other three factors are rescaled instead of padded with 12.5.
    parts = none["score_breakdown"]
    rescaled = (parts["season"] + parts["temperature"] + parts["water"]) / 75 * 100
    assert none["score_raw"] == pytest.approx(rescaled, abs=0.05)
    good = score_crop(crop_dict("maize"), SiteContext(**base, texture="loam", ph=6.8), SEASONS)
    assert good["unassessed"] == []


def test_missing_climate_leaves_temperature_and_rainfed_water_unassessed():
    ctx = SiteContext(sowing_date=date(2026, 10, 2), irrigation="rainfed", region="IN-TN", texture="loam", ph=6.8)
    r = score_crop(crop_dict("maize"), ctx, SEASONS)
    assert set(r["unassessed"]) == {"temperature", "water"}
