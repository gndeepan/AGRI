"""Integration tests against PostgreSQL/PostGIS. External providers are replaced with synthetic fakes."""

import re
from datetime import date, timedelta

import pytest
from sqlalchemy import func, select

from app.modules.lands.models import LandBoundary
from tests.conftest import register, square

pytestmark = pytest.mark.db
FIELD = square(79.138, 10.787, 100)  # synthetic ~1 ha field


def make_land(client, name="North field", boundary=FIELD):
    r = client.post("/api/v1/lands", json={"name": name, "boundary": boundary})
    assert r.status_code == 201, r.text
    return r.json()


def test_auth_flow(api, fakes, db):
    c = api()
    user = register(c)
    assert user["email_verified"] is False and user["preferences"]["language"] == "en"
    assert c.get("/api/v1/auth/me").status_code == 200

    token = re.search(r"token=([\w-]+)", fakes["emails"][-1][2]).group(1)
    assert c.post("/api/v1/auth/verify-email", json={"token": token}).json()["email_verified"] is True
    assert c.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 400  # single use

    assert c.post("/api/v1/auth/refresh").status_code == 200
    assert c.post("/api/v1/auth/logout").status_code == 204
    assert c.get("/api/v1/auth/me").status_code == 401

    bad = api().post("/api/v1/auth/login", json={"email": "farmer@example.com", "password": "wrong-password"})
    assert bad.status_code == 401
    assert api().post("/api/v1/auth/register", json={"email": "FARMER@example.com", "password": "x" * 12,
                                                     "full_name": "Dup"}).status_code == 409


def test_password_reset(api, fakes):
    register(api())
    c = api()
    assert c.post("/api/v1/auth/request-password-reset", json={"email": "nobody@example.com"}).status_code == 202
    assert c.post("/api/v1/auth/request-password-reset", json={"email": "farmer@example.com"}).status_code == 202
    token = re.search(r"token=([\w-]+)", fakes["emails"][-1][2]).group(1)
    assert c.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "new-password-123"}).status_code == 204
    assert c.post("/api/v1/auth/login", json={"email": "farmer@example.com", "password": "new-password-123"}).status_code == 200


def test_preferences_update(api):
    c = api()
    register(c)
    r = c.patch("/api/v1/users/me", json={"preferences": {"language": "ta", "area_unit": "hectare"}})
    assert r.json()["preferences"] == {"language": "ta", "region": None, "area_unit": "hectare", "timezone": "Asia/Kolkata"}


def test_land_crud_and_postgis_cross_check(api, db):
    c = api()
    register(c)
    land = make_land(c)
    assert land["metrics"]["area_ha"] == pytest.approx(1.0, rel=1e-3)
    assert land["state"] == "Tamil Nadu" and "not a legal" in land["boundary_disclaimer"]
    pg_area = db.scalar(select(func.ST_Area(func.Geography(LandBoundary.geom))))
    assert pg_area == pytest.approx(land["metrics"]["area_m2"], rel=5e-3)

    r = c.patch(f"/api/v1/lands/{land['id']}", json={"boundary": square(79.138, 10.787, 50), "name": "Renamed"})
    assert r.status_code == 200 and r.json()["metrics"]["area_m2"] == pytest.approx(2500, rel=1e-3)
    versions = db.scalars(select(LandBoundary.version).order_by(LandBoundary.version)).all()
    assert versions == [1, 2]  # history kept

    assert len(c.get("/api/v1/lands").json()) == 1
    assert c.delete(f"/api/v1/lands/{land['id']}").status_code == 204
    assert c.get("/api/v1/lands").json() == []
    assert c.get(f"/api/v1/lands/{land['id']}").status_code == 404


def test_invalid_geometry_rejected(api):
    c = api()
    register(c)
    bowtie = {"type": "Polygon", "coordinates": [[[79, 10], [79.001, 10.001], [79.001, 10], [79, 10.001], [79, 10]]]}
    r = c.post("/api/v1/lands", json={"name": "bad", "boundary": bowtie})
    assert r.status_code == 422 and r.json()["code"] == "invalid_geometry"
    assert c.post("/api/v1/geo/measure", json={"boundary": FIELD}).json()["vertex_count"] == 4


def test_cross_user_access_is_404(api):
    a, b = api(), api()
    register(a, "a@example.com")
    register(b, "b@example.com")
    land = make_land(a)
    cycle = a.post("/api/v1/cycles", json={
        "land_id": land["id"], "crop_slug": "paddy", "method": "direct_seeding_wet", "anchor_date": str(date.today()),
        "anchor_type": "sowing", "irrigation_method": "flood", "water_availability": "assured"}).json()
    for method, path in [("get", f"/api/v1/lands/{land['id']}"), ("patch", f"/api/v1/lands/{land['id']}"),
                         ("delete", f"/api/v1/lands/{land['id']}"), ("get", f"/api/v1/lands/{land['id']}/weather"),
                         ("get", f"/api/v1/cycles/{cycle['id']}"), ("get", f"/api/v1/cycles/{cycle['id']}/timeline"),
                         ("post", f"/api/v1/cycles/{cycle['id']}/recompute")]:
        kwargs = {"json": {"name": "x"}} if method == "patch" else {}
        assert getattr(b, method)(path, **kwargs).status_code == 404, path
    assert b.get("/api/v1/lands").json() == [] and b.get("/api/v1/cycles").json() == []
    assert b.get("/api/v1/admin/providers").status_code == 403


def test_environment_endpoints(api):
    c = api()
    register(c)
    land = make_land(c)
    wx = c.get(f"/api/v1/lands/{land['id']}/weather").json()
    assert wx["provenance"]["kind"] == "forecast" and len(wx["hourly"]) == 48
    soil = c.get(f"/api/v1/lands/{land['id']}/soil").json()
    assert soil["texture_class"] == "clay" and soil["soil_tests"] == []
    r = c.post(f"/api/v1/lands/{land['id']}/soil-tests", json={"sample_date": "2026-05-01", "ph": 6.4, "texture": "clay loam"})
    assert r.status_code == 201
    assert c.get(f"/api/v1/lands/{land['id']}/soil").json()["soil_tests"][0]["ph"] == 6.4
    terrain = c.get(f"/api/v1/lands/{land['id']}/terrain").json()
    assert terrain["elevation_m"] == 10.0
    recs = c.get(f"/api/v1/lands/{land['id']}/recommendations", params={"sowing_date": "2026-08-10",
                                                                         "irrigation": "assured"}).json()
    paddy = next(r for r in recs if r["crop"]["slug"] == "paddy")
    assert paddy["inputs_used"]["soil"]["kind"] == "user_entered"
    assert paddy["season"]["key"] == "samba"


def test_cycle_plan_timeline_records_and_pdf(api):
    c = api()
    register(c)
    land = make_land(c)
    crops = c.get("/api/v1/crops").json()
    paddy = next(x for x in crops if x["slug"] == "paddy")
    adt43 = next(v for v in paddy["varieties"] if v["name"] == "ADT 43")
    anchor = date.today() - timedelta(days=20)
    r = c.post("/api/v1/cycles", json={
        "land_id": land["id"], "crop_slug": "paddy", "variety_id": adt43["id"], "method": "transplanting",
        "anchor_date": str(anchor), "anchor_type": "transplanting", "nursery_sowing_date": str(anchor - timedelta(days=21)),
        "irrigation_method": "awd", "water_availability": "limited"})
    assert r.status_code == 201, r.text
    cycle = r.json()
    assert cycle["status"] == "active" and cycle["current"]["das"] == 41
    assert [s["key"] for s in cycle["stages"]][0] == "nursery"
    assert cycle["harvest_window"]["earliest"] <= cycle["harvest_window"]["expected"] <= cycle["harvest_window"]["latest"]
    assert cycle["model"]["name"] == "bhoomi-rice-phenology"

    tasks = c.get(f"/api/v1/cycles/{cycle['id']}/tasks").json()
    assert any(t["category"] == "pest_scouting" for t in tasks)

    tl = c.get(f"/api/v1/cycles/{cycle['id']}/timeline").json()
    dates = [date.fromisoformat(d["date"]) for d in tl]
    assert dates == [dates[0] + timedelta(days=i) for i in range(len(dates))]
    kinds = {d["weather"]["kind"] for d in tl if d["weather"]}
    assert {"observed", "forecast", "climatology"} <= kinds
    sample = next(d["weather"] for d in tl if d["weather"] and d["weather"]["kind"] == "forecast")
    assert "precipitation_hours" in sample and "wind_direction_dominant_deg" in sample
    clim = next(d["weather"] for d in tl if d["weather"] and d["weather"]["kind"] == "climatology")
    assert clim["precipitation_hours"] is None
    progress = [d["cycle_progress"] for d in tl]
    assert progress == sorted(progress)
    assert any(e["type"] == "stage_start" for d in tl for e in d["events"])

    flowering = next(s for s in cycle["stages"] if s["key"] == "flowering")
    observed = date.fromisoformat(flowering["start"]["expected"]) + timedelta(days=4)
    assert c.post(f"/api/v1/cycles/{cycle['id']}/observations",
                  json={"observed_on": str(observed), "stage_key": "flowering", "notes": "50% heading"}).status_code == 201
    updated = c.get(f"/api/v1/cycles/{cycle['id']}").json()
    fl = next(s for s in updated["stages"] if s["key"] == "flowering")
    assert fl["source"] == "user_entered" and fl["start"]["expected"] == str(observed)

    assert c.post(f"/api/v1/cycles/{cycle['id']}/irrigation", json={"date": str(anchor), "method": "flood"}).status_code == 201
    assert c.post(f"/api/v1/cycles/{cycle['id']}/inputs", json={"date": str(anchor), "input_type": "seed",
                                                               "product": "ADT 43 seed", "cost_inr": 1200}).status_code == 201
    pdf = c.get(f"/api/v1/cycles/{cycle['id']}/export.pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    dash = c.get("/api/v1/dashboard").json()
    assert dash["totals"]["fields"] == 1 and dash["totals"]["active_cycles"] == 1
    assert dash["fields"][0]["active_cycle"]["crop_name"] == "Paddy (Rice)"


def test_assistant_with_fake_llm(api, monkeypatch):
    from app.modules.assistant.llm import AssistantReply, SuggestedTask

    captured = {}

    class FakeLLM:
        model = "fake-llm"

        def generate(self, system, history, prompt):
            captured["system"], captured["prompt"] = system, prompt
            first_snippet = re.search(r"^\[([^\]]+)\]", prompt, re.M).group(1)
            captured["cited"] = first_snippet
            return AssistantReply(
                answer="Keep 2–5 cm water.", cited_source_ids=[first_snippet, "unknown#9"],
                missing_information=["Recent field photos"],
                suggested_tasks=[SuggestedTask(title="Check water level", description="Use a field tube",
                                               due_date=str(date.today() + timedelta(days=1)), category="irrigation")])

    c = api()
    register(c)
    assert c.post("/api/v1/assistant/conversations", json={}).status_code == 201
    land = make_land(c)
    cycle = c.post("/api/v1/cycles", json={
        "land_id": land["id"], "crop_slug": "paddy", "method": "direct_seeding_wet", "anchor_date": str(date.today()),
        "anchor_type": "sowing", "irrigation_method": "flood", "water_availability": "assured"}).json()
    conv = c.post("/api/v1/assistant/conversations", json={"cycle_id": cycle["id"]}).json()
    assert conv["land_id"] == land["id"]

    monkeypatch.setattr("app.modules.assistant.router.get_llm", lambda: (_ for _ in ()).throw(
        __import__("app.core.errors", fromlist=["AppError"]).AppError(503, "x", "assistant_unavailable")))
    assert c.post(f"/api/v1/assistant/conversations/{conv['id']}/messages", json={"content": "hi"}).status_code == 503

    monkeypatch.setattr("app.modules.assistant.router.get_llm", lambda: FakeLLM())
    r = c.post(f"/api/v1/assistant/conversations/{conv['id']}/messages",
               json={"content": "How much water should I keep this week?"})
    assert r.status_code == 200, r.text
    msg = r.json()["assistant_message"]
    assert "NEVER give pesticide" in captured["system"] and '"crop_plan"' in captured["prompt"]
    assert len(msg["sources"]) == 1 and msg["sources"][0]["url"].startswith("http")  # unknown ids dropped
    assert captured["cited"] in msg["context"]["knowledge_ids"]
    assert "Recent field photos" in msg["content"]
    assert len(msg["suggested_actions"]) == 1

    before = len(c.get(f"/api/v1/cycles/{cycle['id']}/tasks").json())
    ok = c.post("/api/v1/assistant/actions/confirm", json={"message_id": msg["id"], "action_index": 0})
    assert ok.status_code == 200 and ok.json()["task"]["source"] == "assistant_suggested"
    assert len(c.get(f"/api/v1/cycles/{cycle['id']}/tasks").json()) == before + 1
    again = c.post("/api/v1/assistant/actions/confirm", json={"message_id": msg["id"], "action_index": 0})
    assert again.status_code == 409


def test_account_deletion(api):
    c = api()
    register(c)
    make_land(c)
    assert c.request("DELETE", "/api/v1/users/me", json={"password": "wrong"}).status_code == 403
    assert c.request("DELETE", "/api/v1/users/me", json={"password": "paddy-field-2026"}).status_code == 204
    assert api().post("/api/v1/auth/login", json={"email": "farmer@example.com",
                                                  "password": "paddy-field-2026"}).status_code == 401
