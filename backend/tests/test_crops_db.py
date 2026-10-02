"""Variety catalog API against PostgreSQL. The AI is always a synthetic fake."""

from datetime import date

import pytest
from sqlalchemy import select

from app.modules.crops.models import CropCatalog, CropVariety
from tests.conftest import register, square
from tests.test_crop_catalog import FakeVarietyLLM

pytestmark = pytest.mark.db
FIELD = square(79.138, 10.787, 100)  # synthetic ~1 ha field


def _paddy(client) -> dict:
    return next(c for c in client.get("/api/v1/crops").json() if c["slug"] == "paddy")


def test_catalog_lists_all_crops_and_varieties(api):
    c = api()
    register(c)
    crops = c.get("/api/v1/crops").json()
    assert len(crops) >= 28
    coconut = next(x for x in crops if x["slug"] == "coconut")
    assert coconut["plannable"] is False
    jyothi = next(v for v in _paddy(c)["varieties"] if v["name"] == "Jyothi (PTB 39)")
    assert jyothi["group"] == "kerala" and "Matta" in jyothi["aliases"] and jyothi["verified"] is True
    assert jyothi["duration_range"] == [110, 125] and jyothi["is_custom"] is False


def test_suggest_matches_catalog_without_calling_ai(api, monkeypatch):
    llm = FakeVarietyLLM()
    monkeypatch.setattr("app.modules.crops.variety_ai.get_variety_llm", lambda: llm)
    c = api()
    register(c)
    r = c.post("/api/v1/crops/paddy/varieties/suggest", json={"name": "matta"}).json()
    assert r["suggestion"] is None and llm.calls == 0
    assert {"Jyothi (PTB 39)", "Kanchana (PTB 50)"} <= {m["name"] for m in r["matches"]}


def test_ai_suggestion_save_and_plan_with_custom_variety(api, monkeypatch):
    llm = FakeVarietyLLM()
    monkeypatch.setattr("app.modules.crops.variety_ai.get_variety_llm", lambda: llm)
    a, b = api(), api()
    register(a)
    register(b, email="other@example.com")
    r = a.post("/api/v1/crops/paddy/varieties/suggest", json={"name": "Kattuyanam", "region": "Tamil Nadu"})
    assert r.status_code == 200 and llm.calls == 1
    s = r.json()["suggestion"]
    assert s["kind"] == "ai_generated"

    created = a.post("/api/v1/crops/paddy/varieties", json={
        "name": s["name"], "duration_days_range": s["duration_days_range"], "source": "ai_suggested",
        "ai_model": s["model"], "ai_confidence": s["confidence"]})
    assert created.status_code == 201, created.text
    v = created.json()
    assert v["is_custom"] and v["verified"] is False and v["duration_days"] == 170 and v["source"] == "ai_suggested"
    assert a.post("/api/v1/crops/paddy/varieties", json={
        "name": s["name"], "duration_days_range": [160, 180]}).status_code == 409

    # Private to its owner.
    assert any(x["id"] == v["id"] for x in _paddy(a)["varieties"])
    assert not any(x["id"] == v["id"] for x in _paddy(b)["varieties"])

    land_a = a.post("/api/v1/lands", json={"name": "A", "boundary": FIELD}).json()
    land_b = b.post("/api/v1/lands", json={"name": "B", "boundary": FIELD}).json()
    body = {"crop_slug": "paddy", "variety_id": v["id"], "method": "direct_seeding_wet",
            "anchor_date": str(date.today()), "anchor_type": "sowing", "irrigation_method": "flood",
            "water_availability": "assured"}
    assert b.post("/api/v1/cycles", json={**body, "land_id": land_b["id"]}).status_code == 422
    cycle = a.post("/api/v1/cycles", json={**body, "land_id": land_a["id"]})
    assert cycle.status_code == 201, cycle.text
    assert any("AI-suggested" in m for m in cycle.json()["model"]["missing_inputs"])
    assert a.delete(f"/api/v1/crops/varieties/{v['id']}").status_code == 409  # in use
    assert b.delete(f"/api/v1/crops/varieties/{v['id']}").status_code == 404


def test_suggest_without_key_is_503(api, monkeypatch):
    from app.core.errors import AppError

    def no_key():
        raise AppError(503, "AI help is not configured", "assistant_unavailable")

    monkeypatch.setattr("app.modules.crops.variety_ai.get_variety_llm", no_key)
    c = api()
    register(c)
    assert c.post("/api/v1/crops/paddy/varieties/suggest", json={"name": "Totally Unknown 9"}).status_code == 503


def test_perennial_crop_cannot_be_planned(api):
    c = api()
    register(c)
    land = c.post("/api/v1/lands", json={"name": "Grove", "boundary": FIELD}).json()
    r = c.post("/api/v1/cycles", json={
        "land_id": land["id"], "crop_slug": "coconut", "method": "sowing", "anchor_date": str(date.today()),
        "anchor_type": "sowing", "irrigation_method": "drip", "water_availability": "assured"})
    assert r.status_code == 422 and r.json()["code"] == "crop_not_plannable"
    recs = c.get(f"/api/v1/lands/{land['id']}/recommendations").json()
    assert "coconut" not in {x["crop"]["slug"] for x in recs}


def test_seed_is_idempotent_and_renames_old_variety_names(db):
    from app.seed import run_seed

    paddy = db.scalar(select(CropCatalog).where(CropCatalog.slug == "paddy"))
    row = db.scalar(select(CropVariety).where(CropVariety.crop_id == paddy.id, CropVariety.name == "ADT (R) 45"))
    row.name = "ADT 45"  # as stored by seed v1
    db.commit()
    run_seed(db)
    run_seed(db)
    names = list(db.scalars(select(CropVariety.name).where(CropVariety.crop_id == paddy.id,
                                                            CropVariety.owner_id.is_(None))))
    assert "ADT (R) 45" in names and "ADT 45" not in names
    assert len(names) == len(set(names))
