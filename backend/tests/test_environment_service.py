from datetime import date, timedelta

import pytest

from app.core.errors import AppError
from app.core.redis import get_redis
from app.modules.environment.alerts import forecast_alerts
from app.modules.environment.climatology import build_climatology, climatology_day, doy_key
from app.modules.environment.service import EnvironmentService, merge_daily
from tests.fakes import FakeElevation, FakeSoil, FakeWeather

TODAY = date.today()
LAT, LON = 10.787, 79.138


def service(**kw) -> EnvironmentService:
    return EnvironmentService(db=None, weather=kw.get("weather", FakeWeather(TODAY)), elevation=FakeElevation(),
                              soil=kw.get("soil", FakeSoil()))


def test_forecast_is_cached_with_ttl():
    wx = FakeWeather(TODAY)
    svc = service(weather=wx)
    first = svc.weather_bundle(LAT, LON)
    second = svc.weather_bundle(LAT, LON)
    assert wx.forecast_calls == 1
    assert first["provenance"]["cache_status"] == "fresh" and second["provenance"]["cache_status"] == "cached"
    ttl = get_redis().ttl("wx:fc:10.79:79.14")
    assert 0 < ttl <= 30 * 60


def test_forecast_expiry_triggers_refetch():
    wx = FakeWeather(TODAY)
    svc = service(weather=wx)
    svc.weather_bundle(LAT, LON)
    get_redis().delete("wx:fc:10.79:79.14")  # what TTL expiry does
    assert svc.weather_bundle(LAT, LON)["provenance"]["cache_status"] == "fresh"
    assert wx.forecast_calls == 2


def test_provider_failure_without_stored_copy_is_503():
    with pytest.raises(AppError) as exc:
        service(weather=FakeWeather(TODAY, fail=True)).weather_bundle(LAT, LON)
    assert exc.value.status_code == 503 and exc.value.code == "provider_unavailable"


def test_daily_series_mixes_observed_forecast_and_climatology():
    start, end = TODAY - timedelta(days=30), TODAY + timedelta(days=40)
    rows, provs = service().daily_series(LAT, LON, start, end)
    assert len(rows) == (end - start).days + 1 and all(r is not None for r in rows)
    by_date = {r["date"]: r["kind"] for r in rows}
    assert by_date[start.isoformat()] == "observed"
    assert by_date[(TODAY - timedelta(days=2)).isoformat()] == "observed"
    assert by_date[TODAY.isoformat()] == "forecast"
    assert by_date[(TODAY + timedelta(days=15)).isoformat()] == "forecast"
    assert by_date[(TODAY + timedelta(days=16)).isoformat()] == "climatology"  # beyond 16-day horizon
    assert {p["kind"] for p in provs} == {"forecast", "observed", "climatology"}


def test_daily_series_degrades_when_provider_down():
    rows, provs = service(weather=FakeWeather(TODAY, fail=True)).daily_series(LAT, LON, TODAY, TODAY + timedelta(days=3))
    assert rows == [None] * 4 and provs == []


def test_soil_failure_is_503_and_success_is_cached():
    with pytest.raises(AppError):
        service(soil=FakeSoil(fail=True)).soil_profile(LAT, LON)
    svc = service()
    assert svc.soil_profile(LAT, LON)["provenance"]["kind"] == "modelled"
    assert svc.soil_profile(LAT, LON)["provenance"]["cache_status"] == "cached"


def test_terrain_relief_and_slope():
    t = service().terrain((LAT, LON), [(LAT, LON), (LAT + 0.001, LON), (LAT, LON + 0.001)])
    assert t["elevation_m"] == 10.0 and t["relief_m"] == pytest.approx(0.3)
    assert t["slope_deg"] is not None and any("Approximate" in n for n in t["provenance"]["notes"])


def test_rule_alerts_for_heavy_rain_are_labelled():
    rows = [{**r, "kind": "forecast"} for r in [
        {"date": (TODAY + timedelta(days=1)).isoformat(), "precipitation_mm": 120, "wind_gusts_max_kmh": 55,
         "tmax_c": 33}]]
    alerts = forecast_alerts(rows, TODAY)
    assert {a["severity"] for a in alerts} == {"warning", "watch"}
    assert all(a["source"] == "bhoomi_rules" and "not an official IMD warning" in a["message"] for a in alerts)
    assert forecast_alerts([{**rows[0], "kind": "climatology"}], TODAY) == []


def test_climatology_by_calendar_day_handles_leap_day():
    rows = [{"date": d, "tmin_c": 20, "tmax_c": 30, "tmean_c": 25, "precipitation_mm": 2, "kind": "observed"}
            for d in ("2024-02-28", "2024-02-29", "2023-02-28")]
    clim = build_climatology(rows)
    assert doy_key(date(2024, 2, 29)) == "02-28"
    assert clim["02-28"]["years"] == 3
    day = climatology_day(clim, date(2027, 2, 28))
    assert day["kind"] == "climatology" and day["tmean_c"] == 25


def test_merge_precedence():
    a = [{"date": "2026-01-01", "src": "a"}]
    b = [{"date": "2026-01-01", "src": "b"}, {"date": "2026-01-02", "src": "b"}]
    merged = merge_daily(date(2026, 1, 1), date(2026, 1, 3), a, b)
    assert [m and m["src"] for m in merged] == ["a", "b", None]
