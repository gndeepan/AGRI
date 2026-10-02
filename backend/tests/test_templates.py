import re
from datetime import date

from app.modules.planning import engine
from app.modules.planning.templates import generic_tasks, rice_tasks

ANCHOR = date(2026, 8, 20)


def _pred(transplanted=True):
    defs = engine.rice_stage_defs(130, transplanted=transplanted, nursery_days=25 if transplanted else 0)
    start = date(2026, 7, 26) if transplanted else ANCHOR
    return engine.predict(defs, start, lambda d: {"tmean_c": 28, "kind": "observed"})


def test_rice_tasks_cover_plan_without_doses():
    tasks = rice_tasks(_pred(), ANCHOR, "transplanting", "limited")
    keys = {t["template_key"] for t in tasks}
    assert {"nursery_sow", "establish", "awd", "topdress_tillering", "topdress_pi", "scout_bph", "harvest"} <= keys
    for t in tasks:
        text = f"{t['title']} {t['description']}"
        assert not re.search(r"\d+\s*(kg|g|ml|l)\s*/\s*(ha|acre)", text, re.I), text
    nutrient = [t for t in tasks if t["category"] == "nutrient"]
    assert all("Soil Health Card" in t["description"] for t in nutrient)


def test_awd_only_when_water_not_assured():
    keys = {t["template_key"] for t in rice_tasks(_pred(), ANCHOR, "transplanting", "assured")}
    assert "awd" not in keys


def test_direct_seeding_has_no_nursery():
    tasks = rice_tasks(_pred(False), ANCHOR, "direct_seeding_wet", "assured")
    assert "nursery_sow" not in {t["template_key"] for t in tasks}
    assert next(t for t in tasks if t["template_key"] == "establish")["title"].startswith("Sow")


def test_generic_tasks():
    defs = engine.fraction_stage_defs(90, [("establishment", 0.1), ("vegetative", 0.3), ("flowering", 0.15),
                                           ("yield_formation", 0.35), ("maturity", 0.1)])
    pred = engine.predict(defs, ANCHOR, lambda d: {"tmean_c": 28, "kind": "observed"})
    keys = {t["template_key"] for t in generic_tasks(pred, ANCHOR, "rainfed")}
    assert "harvest" in keys and "water_critical" not in keys
