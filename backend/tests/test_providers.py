from datetime import date, timedelta

import httpx
import pytest
import respx

from app.core.config import get_settings
from app.core.http import CircuitOpenError, ProviderError, ResilientClient, provider_health_snapshot
from app.modules.environment.providers.open_meteo import OpenMeteoElevation, OpenMeteoWeather
from app.modules.environment.providers.soilgrids import SoilGridsProvider, usda_texture_class
from tests.fakes import daily_block, forecast_payload

TODAY = date(2026, 10, 2)


def client(name: str, retries: int = 3) -> ResilientClient:
    return ResilientClient(name, retries=retries, backoff_base_s=0)


@respx.mock
def test_forecast_normalization_tags_past_and_future():
    respx.get(get_settings().open_meteo_forecast_url).mock(return_value=httpx.Response(200, json=forecast_payload(TODAY)))
    wx = OpenMeteoWeather(client=client("open-meteo-forecast"))
    result = wx.forecast(10.79, 79.14)
    n = result.normalized
    assert n["current"]["temperature_c"] == 30.1 and n["current"]["is_day"] is True
    assert len(n["hourly"]) == 48 and n["hourly"][0]["time"].startswith(f"{TODAY}T10")
    kinds = {d["date"]: d["kind"] for d in n["daily"]}
    assert kinds[(TODAY - timedelta(days=1)).isoformat()] == "observed"
    assert kinds[TODAY.isoformat()] == "forecast"
    assert result.license == "CC BY 4.0"
    assert provider_health_snapshot("open-meteo-forecast")["calls"] == 1


@respx.mock
def test_archive_rows_are_observed():
    payload = {"daily": daily_block(date(2026, 1, 1), 10)}
    respx.get(get_settings().open_meteo_archive_url).mock(return_value=httpx.Response(200, json=payload))
    wx = OpenMeteoWeather(archive_client=client("open-meteo-archive"))
    rows = wx.history(10.79, 79.14, date(2026, 1, 1), date(2026, 1, 10)).normalized
    assert len(rows) == 10 and {r["kind"] for r in rows} == {"observed"}
    assert rows[0]["precipitation_hours"] == 1.0 and rows[0]["wind_direction_dominant_deg"] == 220


def test_forecast_requests_precipitation_hours_and_climatology_leaves_it_unknown():
    from app.modules.environment.climatology import build_climatology, climatology_day
    from app.modules.environment.providers.open_meteo import ARCHIVE_DAILY_VARS, DAILY_VARS

    assert "precipitation_hours" in DAILY_VARS and "precipitation_hours" in ARCHIVE_DAILY_VARS
    rows = [{"date": "2025-10-02", "tmax_c": 32, "precipitation_mm": 6.0, "precipitation_hours": 5}]
    day = climatology_day(build_climatology(rows), date(2026, 10, 2))
    assert day["kind"] == "climatology" and day["precipitation_hours"] is None


@respx.mock
def test_retry_then_success():
    route = respx.get(get_settings().open_meteo_forecast_url).mock(side_effect=[
        httpx.Response(503), httpx.ConnectTimeout("timeout"), httpx.Response(200, json=forecast_payload(TODAY))])
    OpenMeteoWeather(client=client("open-meteo-forecast")).forecast(10.79, 79.14)
    assert route.call_count == 3
    snap = provider_health_snapshot("open-meteo-forecast")
    assert snap["errors"] == 2 and snap["calls"] == 3


@respx.mock
def test_client_errors_are_not_retried():
    route = respx.get("https://example.test/x").mock(return_value=httpx.Response(400, text="bad"))
    with pytest.raises(ProviderError) as exc:
        client("example").get_json("https://example.test/x")
    assert exc.value.status_code == 400 and route.call_count == 1


@respx.mock
def test_circuit_breaker_opens_after_repeated_failures():
    route = respx.get("https://example.test/down").mock(return_value=httpx.Response(500))
    c = client("flaky", retries=1)
    for _ in range(5):
        with pytest.raises(ProviderError):
            c.get_json("https://example.test/down")
    with pytest.raises(CircuitOpenError):
        c.get_json("https://example.test/down")
    assert route.call_count == 5
    assert provider_health_snapshot("flaky")["circuit_state"] == "open"


@respx.mock
def test_elevation_length_mismatch_is_an_error():
    respx.get(get_settings().open_meteo_elevation_url).mock(return_value=httpx.Response(200, json={"elevation": [1.0]}))
    with pytest.raises(ProviderError):
        OpenMeteoElevation(client=client("open-meteo-elevation")).elevations([(10.0, 79.0), (10.1, 79.1)])


def soilgrids_payload(null: bool = False) -> dict:
    """Synthetic SoilGrids-shaped response (mapped units before d_factor conversion)."""
    values = {"sand": 300, "silt": 250, "clay": 450, "phh2o": 72, "soc": 80, "cec": 300, "bdod": 140}
    factors = {"sand": 10, "silt": 10, "clay": 10, "phh2o": 10, "soc": 10, "cec": 10, "bdod": 100}
    return {"properties": {"layers": [
        {"name": name, "unit_measure": {"d_factor": factors[name]},
         "depths": [{"label": d, "values": {"mean": None if null else v}} for d in ("0-5cm", "5-15cm", "15-30cm")]}
        for name, v in values.items()]}}


@respx.mock
def test_soilgrids_normalization():
    respx.get(get_settings().soilgrids_url).mock(return_value=httpx.Response(200, json=soilgrids_payload()))
    result = SoilGridsProvider(client=client("soilgrids")).profile(10.79, 79.14)
    top = result.normalized["layers"][0]
    assert top["clay_pct"] == 45.0 and top["ph"] == 7.2 and top["bulk_density"] == 1.4 and top["soc_g_per_kg"] == 8.0
    assert result.normalized["texture_class"] == "clay"
    assert any("not measurements" in lim for lim in result.normalized["limitations"])


@respx.mock
def test_soilgrids_missing_values_reported_as_limitation():
    respx.get(get_settings().soilgrids_url).mock(return_value=httpx.Response(200, json=soilgrids_payload(null=True)))
    result = SoilGridsProvider(client=client("soilgrids")).profile(10.79, 79.14)
    assert result.normalized["texture_class"] is None
    assert any("No soil estimate" in lim for lim in result.normalized["limitations"])


@pytest.mark.parametrize(("sand", "silt", "clay", "expected"), [
    (92, 5, 3, "sand"), (40, 40, 20, "loam"), (20, 65, 15, "silt loam"), (20, 20, 60, "clay"),
    (65, 15, 20, "sandy clay loam"), (35, 30, 35, "clay loam"), (5, 50, 45, "silty clay"), (70, 20, 10, "sandy loam"),
])
def test_usda_texture_triangle(sand, silt, clay, expected):
    assert usda_texture_class(sand, silt, clay) == expected
