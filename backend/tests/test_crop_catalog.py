"""Crop/variety catalog: seed data sanity, fuzzy matching, AI suggestion shaping (fake LLM, synthetic)."""

from app.modules.crops.models import CropVariety
from app.modules.crops.variety_ai import VarietyProfile, ai_suggestion, catalog_matches, normalize
from app.seed.crops import CROPS, SEASONS


def _row(name: str, aliases: list[str] | None = None) -> CropVariety:
    return CropVariety(name=name, duration_days=110, duration_group="short", seasons=[], data={"aliases": aliases or []})


def test_seed_catalog_is_consistent():
    slugs = [c["slug"] for c in CROPS]
    assert len(slugs) == len(set(slugs)) and len(slugs) >= 28
    for crop in CROPS:
        lo, hi = crop["data"]["duration_days"]
        assert 0 < lo <= hi
        assert crop["image_url"] == f"/images/crops/{crop['slug']}.jpg"
        assert all(k in SEASONS for k in crop["data"]["seasons"])
        names = [v["name"] for v in crop["varieties"]]
        assert len(names) == len(set(names)), crop["slug"]
        for v in crop["varieties"]:
            vlo, vhi = v["duration_range"]
            assert vlo <= v["duration_days"] <= vhi
            assert v["duration_group"] in {"short", "medium", "long"}
            assert v["reference"] and v["reference"]["url"].startswith("http")
            assert all(s in SEASONS for s in v["seasons"])
            assert v["group"] in {"tn", "national", "kerala", "traditional"}


def test_requested_varieties_are_in_the_catalog():
    paddy = next(c for c in CROPS if c["slug"] == "paddy")
    names = {v["name"] for v in paddy["varieties"]}
    for expected in ["Jyothi (PTB 39)", "Kanchana (PTB 50)", "Uma (MO 16)", "ADT 53", "CO 51", "BPT 5204",
                     "Improved White Ponni", "Seeraga Samba", "Mappillai Samba", "CR 1009 Sub1"]:
        assert expected in names
    assert len(paddy["varieties"]) >= 100


def test_unverified_entries_say_so():
    paddy = next(c for c in CROPS if c["slug"] == "paddy")
    for v in paddy["varieties"]:
        if not v["verified"]:
            assert v["notes"] and "approximate" in v["notes"].lower()


def test_normalize_and_alias_matching():
    rows = [_row("Jyothi (PTB 39)", ["Matta", "Jyothy", "PTB 39"]), _row("ADT (R) 45", ["ADT 45"]),
            _row("Kanchana (PTB 50)", ["Matta"]), _row("CO 51")]
    assert normalize("ADT (R) 45") == "adtr45"
    assert catalog_matches("matta", rows)[0][1] == 1.0
    assert {v.name for v, _ in catalog_matches("matta", rows)} == {"Jyothi (PTB 39)", "Kanchana (PTB 50)"}
    assert catalog_matches("adt45", rows)[0][0].name == "ADT (R) 45"
    assert catalog_matches("jyoti", rows)[0][0].name == "Jyothi (PTB 39)"  # misspelling
    assert catalog_matches("Kattuyanam", rows) == []
    assert catalog_matches("  ", rows) == []


class FakeVarietyLLM:
    model = "fake-model"

    def __init__(self, recognized: bool = True):
        self.recognized = recognized
        self.calls = 0

    def profile(self, crop_name, variety_name, region):
        self.calls += 1
        return VarietyProfile(recognized=self.recognized, name=variety_name.title(), duration_days_min=180,
                              duration_days_max=160, confidence="medium", caveats=["Synthetic test profile"])


def test_ai_suggestion_is_labelled_and_sanitised():
    from app.modules.crops.models import CropCatalog

    crop = CropCatalog(slug="paddy", name_en="Paddy (Rice)")
    s = ai_suggestion(crop, "kattuyanam", "Tamil Nadu", FakeVarietyLLM())
    assert s["kind"] == "ai_generated" and s["model"] == "fake-model"
    assert s["duration_days_range"] == [160, 180]  # sorted
    assert s["duration_group"] == "long"
    unknown = ai_suggestion(crop, "zzz", None, FakeVarietyLLM(recognized=False))
    assert unknown["confidence"] == "low" and "did not recognise" in unknown["caveats"][0]
