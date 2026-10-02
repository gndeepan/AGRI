"""SYNTHETIC test fixtures. None of these values are real observations or forecasts."""

import math
from datetime import UTC, date, datetime, timedelta

from app.core.http import ProviderError
from app.modules.environment.providers.base import ProviderResult
from app.modules.environment.providers.open_meteo import normalize_daily, normalize_forecast


def synthetic_tmean(d: date) -> float:
    """Smooth synthetic seasonal curve, 25–31 °C."""
    return round(28 + 3 * math.sin(2 * math.pi * d.timetuple().tm_yday / 365), 2)


def daily_block(start: date, days: int, rain_on: dict[date, float] | None = None, gusts: float = 20.0) -> dict:
    rain_on = rain_on or {}
    dates = [start + timedelta(days=i) for i in range(days)]
    tmeans = [synthetic_tmean(d) for d in dates]
    return {
        "time": [d.isoformat() for d in dates],
        "temperature_2m_min": [t - 4 for t in tmeans],
        "temperature_2m_max": [t + 4 for t in tmeans],
        "temperature_2m_mean": tmeans,
        "precipitation_sum": [rain_on.get(d, 1.0) for d in dates],
        "precipitation_hours": [min(24.0, rain_on.get(d, 1.0)) for d in dates],
        "precipitation_probability_max": [40 for _ in dates],
        "wind_speed_10m_max": [12.0 for _ in dates],
        "wind_gusts_10m_max": [gusts for _ in dates],
        "wind_direction_10m_dominant": [220 for _ in dates],
        "relative_humidity_2m_mean": [75 for _ in dates],
        "cloud_cover_mean": [50 for _ in dates],
        "sunrise": [f"{d}T06:05" for d in dates],
        "sunset": [f"{d}T18:10" for d in dates],
        "weather_code": [3 for _ in dates],
        "et0_fao_evapotranspiration": [4.5 for _ in dates],
    }


def forecast_payload(today: date, lat: float = 10.79, lon: float = 79.14, rain_on: dict | None = None) -> dict:
    hours = [datetime(today.year, today.month, today.day) + timedelta(hours=h) for h in range(-24, 96)]
    return {
        "latitude": lat, "longitude": lon, "timezone": "Asia/Kolkata", "utc_offset_seconds": 19800,
        "current": {"time": f"{today}T10:00", "interval": 900, "temperature_2m": 30.1, "apparent_temperature": 34.0,
                    "relative_humidity_2m": 70, "precipitation": 0.0, "cloud_cover": 40, "wind_speed_10m": 11.0,
                    "wind_direction_10m": 210, "wind_gusts_10m": 22.0, "surface_pressure": 1008.0, "is_day": 1,
                    "weather_code": 2, "visibility": 13000.0, "rain": 0.0, "showers": 0.0, "snowfall": 0.0,
                    "cloud_cover_low": 30, "cloud_cover_mid": 15, "cloud_cover_high": 5},
        "hourly": {
            "time": [h.strftime("%Y-%m-%dT%H:%M") for h in hours],
            "temperature_2m": [28.0] * len(hours), "precipitation": [0.0] * len(hours),
            "precipitation_probability": [10] * len(hours), "wind_speed_10m": [10.0] * len(hours),
            "cloud_cover": [40] * len(hours), "relative_humidity_2m": [70] * len(hours),
            "weather_code": [2] * len(hours), "visibility": [12000.0] * len(hours), "rain": [0.0] * len(hours),
            "showers": [0.0] * len(hours), "cloud_cover_low": [30] * len(hours), "cloud_cover_mid": [15] * len(hours),
            "cloud_cover_high": [5] * len(hours), "wind_direction_10m": [210] * len(hours),
            "wind_gusts_10m": [20.0] * len(hours), "is_day": [1 if 6 <= h.hour < 18 else 0 for h in hours],
        },
        "daily": daily_block(today - timedelta(days=7), 23, rain_on),
    }


class FakeWeather:
    name = "fake-weather"
    forecast_horizon_days = 16

    def __init__(self, today: date | None = None, fail: bool = False, rain_on: dict | None = None):
        self.today = today or date.today()
        self.fail = fail
        self.rain_on = rain_on
        self.forecast_calls = 0
        self.history_calls = 0

    def _result(self, normalized, dataset: str) -> ProviderResult:
        return ProviderResult(normalized=normalized, raw=None, provider="open-meteo", dataset=dataset,
                              retrieved_at=datetime.now(UTC), license="CC BY 4.0", attribution="synthetic")

    def forecast(self, lat: float, lon: float) -> ProviderResult:
        self.forecast_calls += 1
        if self.fail:
            raise ProviderError("open-meteo-forecast", "synthetic failure")
        return self._result(normalize_forecast(forecast_payload(self.today, lat, lon, self.rain_on)), "synthetic forecast")

    def history(self, lat: float, lon: float, start: date, end: date) -> ProviderResult:
        self.history_calls += 1
        if self.fail:
            raise ProviderError("open-meteo-archive", "synthetic failure")
        days = (end - start).days + 1
        return self._result(normalize_daily(daily_block(start, days), today=None), "synthetic archive")


class FakeSoil:
    name = "fake-soil"

    def __init__(self, fail: bool = False):
        self.fail = fail

    def profile(self, lat: float, lon: float) -> ProviderResult:
        if self.fail:
            raise ProviderError("soilgrids", "synthetic failure")
        layers = [{"depth": d, "sand_pct": 30.0, "silt_pct": 25.0, "clay_pct": 45.0, "ph": 7.2,
                   "soc_g_per_kg": 8.0, "cec_cmol_per_kg": 30.0, "bulk_density": 1.4}
                  for d in ("0-5cm", "5-15cm", "15-30cm")]
        return ProviderResult(
            normalized={"texture_class": "clay", "layers": layers, "drainage_hint": "synthetic",
                        "irrigation_suitability": "synthetic", "limitations": ["synthetic fixture"]},
            raw=None, provider="soilgrids", dataset="synthetic soil", retrieved_at=datetime.now(UTC), resolution="250 m",
        )


class FakeElevation:
    name = "fake-elevation"

    def elevations(self, points):
        return ProviderResult(normalized=[10.0 + i * 0.1 for i in range(len(points))], raw=None, provider="open-meteo",
                              dataset="synthetic DEM", retrieved_at=datetime.now(UTC), resolution="90 m")


class FakeGeocoder:
    def search(self, query):
        return [{"name": "Synthetic village", "display_name": "Synthetic village, Thanjavur", "lat": 10.79,
                 "lon": 79.14, "bbox": None, "kind": "village"}]

    def reverse(self, lat, lon):
        return {"village": "Synthetic village", "district": "Thanjavur", "state": "Tamil Nadu", "display_name": "x"}
