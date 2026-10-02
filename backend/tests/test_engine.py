from datetime import date, timedelta

import pytest

from app.modules.planning import engine
from app.modules.planning.gdd import daily_gdd, tmean_of

START = date(2026, 8, 1)


def constant(tmean: float, kind: str = "observed"):
    return lambda d: {"tmean_c": tmean, "kind": kind}


def test_gdd_capped_and_floored():
    assert daily_gdd(28) == 18
    assert daily_gdd(40) == 25  # capped at 35 °C
    assert daily_gdd(5) == 0
    assert tmean_of({"tmin_c": 20, "tmax_c": 30}) == 25
    assert tmean_of(None) is None


def test_reference_temperature_reproduces_variety_duration():
    defs = engine.rice_stage_defs(110, transplanted=True, nursery_days=18)
    pred = engine.predict(defs, START, constant(28))
    assert [s.key for s in pred.stages] == ["nursery", "establishment", "tillering", "panicle_initiation",
                                            "flowering", "grain_filling", "maturity"]
    assert pred.harvest.end == START + timedelta(days=110)
    for prev, nxt in zip(pred.stages, pred.stages[1:], strict=False):
        assert prev.end == nxt.start  # contiguous, ordered
        assert prev.start < prev.end
    flowering = next(s for s in pred.stages if s.key == "flowering")
    assert (pred.harvest.end - flowering.start).days == 35  # flowering window + ~30 d ripening at reference


def test_temperature_changes_duration():
    defs = engine.rice_stage_defs(130, transplanted=False, nursery_days=0)
    warm = engine.predict(defs, START, constant(31)).harvest.end
    ref = engine.predict(defs, START, constant(28)).harvest.end
    cool = engine.predict(defs, START, constant(24)).harvest.end
    assert warm < ref < cool


def test_deterministic():
    defs = engine.rice_stage_defs(145, transplanted=True, nursery_days=30)
    lookup = lambda d: {"tmean_c": 26 + (d.toordinal() % 7) * 0.5, "kind": "forecast"}  # noqa: E731
    a = engine.predict(defs, START, lookup)
    b = engine.predict(defs, START, lookup)
    assert [(s.key, s.start, s.end, s.gdd_end) for s in a.stages] == [(s.key, s.start, s.end, s.gdd_end) for s in b.stages]


def test_observation_reanchors_following_stages():
    defs = engine.rice_stage_defs(110, transplanted=False, nursery_days=0)
    base = engine.predict(defs, START, constant(28))
    predicted_flowering = next(s for s in base.stages if s.key == "flowering").start
    observed = predicted_flowering + timedelta(days=5)
    pred = engine.predict(defs, START, constant(28), observed_starts={"flowering": observed})
    flowering = next(s for s in pred.stages if s.key == "flowering")
    previous = next(s for s in pred.stages if s.key == "panicle_initiation")
    assert flowering.start == observed and flowering.source == "user_entered" and flowering.start_margin == 0
    assert previous.end == observed
    assert pred.harvest.end == base.harvest.end + timedelta(days=5)


def test_earlier_observation_rewinds():
    defs = engine.rice_stage_defs(110, transplanted=False, nursery_days=0)
    base = engine.predict(defs, START, constant(28))
    pi = next(s for s in base.stages if s.key == "panicle_initiation").start
    pred = engine.predict(defs, START, constant(28), observed_starts={"panicle_initiation": pi - timedelta(days=4)})
    assert pred.harvest.end == base.harvest.end - timedelta(days=4)


def test_climatology_widens_uncertainty_and_unknown_variety_adds_margin():
    horizon = START + timedelta(days=16)
    lookup = lambda d: {"tmean_c": 28, "kind": "forecast" if d < horizon else "climatology"}  # noqa: E731
    defs = engine.rice_stage_defs(120, transplanted=False, nursery_days=0)
    pred = engine.predict(defs, START, lookup)
    margins = [s.end_margin for s in pred.stages]
    assert margins[0] == 2
    assert margins[-1] > margins[0]
    assert margins == sorted(margins)
    assert any("climatology" in a for a in pred.assumptions)
    unknown = engine.predict(defs, START, lookup, variety_known=False)
    assert unknown.harvest.end_margin == pred.harvest.end_margin + 5
    assert unknown.missing_inputs


def test_missing_weather_uses_reference_and_counts_as_estimate():
    defs = engine.rice_stage_defs(110, transplanted=False, nursery_days=0)
    pred = engine.predict(defs, START, lambda d: None)
    assert pred.harvest.end == START + timedelta(days=110)
    assert pred.harvest.end_margin == 7


def test_stage_on_and_progress():
    defs = engine.rice_stage_defs(110, transplanted=False, nursery_days=0)
    pred = engine.predict(defs, START, constant(28))
    stage, local = engine.stage_on(pred, START - timedelta(days=3))
    assert stage.key == "establishment" and local == 0
    stage, local = engine.stage_on(pred, pred.harvest.end + timedelta(days=10))
    assert stage.key == "maturity" and local == 1
    mid = START + timedelta(days=55)
    assert engine.cycle_progress(pred, mid) == pytest.approx(55 / 110)


def test_fraction_model_for_other_crops():
    defs = engine.fraction_stage_defs(100, [("establishment", 0.1), ("vegetative", 0.3), ("flowering", 0.0),
                                            ("yield_formation", 0.5), ("maturity", 0.1)])
    assert [d.key for d in defs] == ["establishment", "vegetative", "yield_formation", "maturity"]
    pred = engine.predict(defs, START, constant(28), model=engine.FRACTION_MODEL)
    assert pred.harvest.end == START + timedelta(days=100)
    assert pred.model_name == "bhoomi-stage-fraction"


def test_extra_margin_widens_ranges_without_claiming_variety_unknown():
    defs = engine.rice_stage_defs(130, transplanted=False, nursery_days=0)
    base = engine.predict(defs, START, constant(28, "climatology"))
    wide = engine.predict(defs, START, constant(28, "climatology"), extra_margin_days=5)
    assert wide.stages[-1].end_margin == base.stages[-1].end_margin + 5
    assert wide.stages[-1].end == base.stages[-1].end
    assert not any("Variety not specified" in m for m in wide.missing_inputs)
