"""AI crop recommendations. The model is always a synthetic fake; field data comes from the synthetic
providers in tests/fakes.py (clay 45 %, sand 30 %, pH 7.2)."""

import pytest

from app.core.errors import AppError
from app.modules.crops.ai_recs import AIRec, AIRecsOut, _grounded, _numbers
from tests.conftest import register, square

FIELD = square(79.138, 10.787, 100)  # synthetic ~1 ha field


class FakeRecsLLM:
    model = "fake-gemini"

    def __init__(self, out: AIRecsOut | None = None, fail: bool = False):
        self.out = out or default_answer()
        self.fail = fail
        self.calls = 0
        self.prompts: list[str] = []

    def recommend(self, prompt: str) -> AIRecsOut:
        self.calls += 1
        self.prompts.append(prompt)
        if self.fail:
            raise AppError(502, "The AI service failed to answer.", "assistant_error")
        return self.out


def default_answer() -> AIRecsOut:
    return AIRecsOut(
        summary="Heavy clay soil with 45 % clay suits flooded paddy.",
        recommendations=[
            AIRec(crop_slug="paddy", rank=1, fit="strong", varieties=["ADT 43", "Imaginary Rice 9"],
                  why=["Soil has 45 % clay, which holds standing water.", "Expected yield 6200 kg/ha."],
                  risks=["Clay at 45 % drains slowly after heavy rain."], sowing_window="01 Oct – 31 Oct",
                  water_plan="Keep 2–5 cm standing water; drain before harvest.", confidence="high"),
            AIRec(crop_slug="wheat", rank=2, fit="moderate", varieties=[], why=["Cool nights."], confidence="low"),
            AIRec(crop_slug="black-gram", rank=3, fit="weak", varieties=[], why=["Profit of 98000 rupees."],
                  confidence="low"),
        ],
        data_gaps=["No canal schedule."],
    )


def test_number_grounding_check():
    allowed = _numbers('{"clay_pct": 45.0, "rain": 612, "ph": 7.2}')
    assert _grounded("Soil has 45 % clay and pH 7.2.", allowed)
    assert _grounded("Typical rain is about 610 mm.", allowed)  # within 3 %
    assert _grounded("Split nitrogen into 3 doses.", allowed)  # small counts are not data claims
    assert not _grounded("Expected yield 6200 kg/ha.", allowed)


@pytest.mark.db
def test_ai_recs_are_validated_against_catalog_and_field_numbers(api, monkeypatch):
    llm = FakeRecsLLM()
    monkeypatch.setattr("app.modules.crops.ai_recs.get_recs_llm", lambda: llm)
    c = api()
    register(c)
    land = c.post("/api/v1/lands", json={"name": "Synthetic AI field", "boundary": FIELD}).json()
    r = c.get(f"/api/v1/lands/{land['id']}/recommendations/ai",
              params={"sowing_date": "2026-10-02", "irrigation": "assured"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ok" and body["kind"] == "ai_generated" and body["model"] == "fake-gemini"
    slugs = [x["crop"]["slug"] for x in body["recommendations"]]
    assert slugs == ["paddy"]  # "wheat" is not in the catalog; black gram's only reason was ungrounded
    paddy = body["recommendations"][0]
    assert [v["name"] for v in paddy["varieties"]] == ["ADT 43"]
    assert paddy["why"] == ["Soil has 45 % clay, which holds standing water."]
    assert body["dropped_claims"] >= 4
    assert {i["key"] for i in body["inputs"]} >= {"location", "soil", "climate", "irrigation"}
    # The prompt carried this field's real soil numbers and the catalog.
    assert '"clay_pct": 45.0' in llm.prompts[0] and "ADT 43" in llm.prompts[0]

    again = c.get(f"/api/v1/lands/{land['id']}/recommendations/ai",
                  params={"sowing_date": "2026-10-02", "irrigation": "assured"}).json()
    assert again["cached"] is True and llm.calls == 1


@pytest.mark.db
def test_ai_unavailable_without_key_or_on_failure(api, monkeypatch):
    c = api()
    register(c)
    land = c.post("/api/v1/lands", json={"name": "Synthetic AI field", "boundary": FIELD}).json()
    url = f"/api/v1/lands/{land['id']}/recommendations/ai"

    monkeypatch.setattr("app.modules.crops.ai_recs.get_recs_llm", lambda: None)
    body = c.get(url).json()
    assert body["status"] == "unavailable" and body["recommendations"] == []
    assert "not configured" in body["reason"]

    failing = FakeRecsLLM(fail=True)
    monkeypatch.setattr("app.modules.crops.ai_recs.get_recs_llm", lambda: failing)
    body = c.get(url, params={"irrigation": "rainfed"}).json()
    assert body["status"] == "unavailable" and body["recommendations"] == []

    junk = FakeRecsLLM(AIRecsOut(summary="x", recommendations=[
        AIRec(crop_slug="quinoa", rank=1, fit="strong", why=["Great."], confidence="high")]))
    monkeypatch.setattr("app.modules.crops.ai_recs.get_recs_llm", lambda: junk)
    body = c.get(url, params={"irrigation": "assured"}).json()
    assert body["status"] == "unavailable" and "validation" in body["reason"]


@pytest.mark.db
def test_ai_reports_insufficient_data_when_soil_and_climate_missing(api, fakes, monkeypatch):
    from tests import fakes as f

    llm = FakeRecsLLM()
    monkeypatch.setattr("app.modules.crops.ai_recs.get_recs_llm", lambda: llm)
    monkeypatch.setattr("app.modules.environment.service.SoilGridsProvider", lambda: f.FakeSoil(fail=True))
    fakes["weather"].fail = True
    c = api()
    register(c)
    land = c.post("/api/v1/lands", json={"name": "Synthetic AI field", "boundary": FIELD}).json()
    body = c.get(f"/api/v1/lands/{land['id']}/recommendations/ai").json()
    assert body["status"] == "insufficient_data" and llm.calls == 0
    assert any("soil" in m.lower() for m in body["missing"])
    assert any("climatology" in m.lower() for m in body["missing"])
