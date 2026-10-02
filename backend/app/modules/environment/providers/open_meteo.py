"""Open-Meteo adapters (forecast, historical archive, elevation). CC BY 4.0."""

from datetime import UTC, date, datetime
from typing import Any

from app.core.config import get_settings
from app.core.http import ProviderError, ResilientClient
from app.modules.environment.providers.base import ProviderResult

LICENSE = "CC BY 4.0"
ATTRIBUTION = "Weather data by Open-Meteo.com"

CURRENT_VARS = [
    "temperature_2m", "apparent_temperature", "relative_humidity_2m", "precipitation", "cloud_cover",
    "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "surface_pressure", "is_day", "weather_code",
]
HOURLY_VARS = [
    "temperature_2m", "precipitation", "precipitation_probability", "wind_speed_10m", "cloud_cover",
    "relative_humidity_2m",
]
DAILY_VARS = [
    "temperature_2m_min", "temperature_2m_max", "temperature_2m_mean", "precipitation_sum",
    "precipitation_hours", "precipitation_probability_max", "wind_speed_10m_max", "wind_gusts_10m_max",
    "wind_direction_10m_dominant", "relative_humidity_2m_mean", "cloud_cover_mean", "sunrise", "sunset",
    "weather_code", "et0_fao_evapotranspiration",
]
ARCHIVE_DAILY_VARS = [v for v in DAILY_VARS if v != "precipitation_probability_max"]


def _col(block: dict[str, Any], key: str, i: int) -> Any:
    values = block.get(key)
    if not values or i >= len(values):
        return None
    return values[i]


def _mean(a: Any, b: Any) -> float | None:
    if a is None or b is None:
        return None
    return round((a + b) / 2, 2)


def normalize_daily(daily: dict[str, Any], today: date | None, horizon_kind: str = "forecast") -> list[dict]:
    """Convert Open-Meteo daily arrays to WeatherDaily dicts. Dates before `today` are
    tagged observed; `today` and later get `horizon_kind`. If today is None all rows are observed."""
    rows = []
    for i, d in enumerate(daily.get("time", [])):
        day = date.fromisoformat(d)
        tmin, tmax = _col(daily, "temperature_2m_min", i), _col(daily, "temperature_2m_max", i)
        tmean = _col(daily, "temperature_2m_mean", i)
        rows.append({
            "date": day.isoformat(),
            "tmin_c": tmin,
            "tmax_c": tmax,
            "tmean_c": tmean if tmean is not None else _mean(tmin, tmax),
            "precipitation_mm": _col(daily, "precipitation_sum", i),
            "precipitation_hours": _col(daily, "precipitation_hours", i),
            "precipitation_probability_pct": _col(daily, "precipitation_probability_max", i),
            "wind_speed_max_kmh": _col(daily, "wind_speed_10m_max", i),
            "wind_gusts_max_kmh": _col(daily, "wind_gusts_10m_max", i),
            "wind_direction_dominant_deg": _col(daily, "wind_direction_10m_dominant", i),
            "humidity_mean_pct": _col(daily, "relative_humidity_2m_mean", i),
            "cloud_cover_mean_pct": _col(daily, "cloud_cover_mean", i),
            "sunrise": _col(daily, "sunrise", i),
            "sunset": _col(daily, "sunset", i),
            "weather_code": _col(daily, "weather_code", i),
            "et0_mm": _col(daily, "et0_fao_evapotranspiration", i),
            "kind": "observed" if today is None or day < today else horizon_kind,
        })
    return rows


def normalize_forecast(payload: dict[str, Any]) -> dict[str, Any]:
    cur = payload.get("current", {})
    current = {
        "time": cur.get("time"),
        "temperature_c": cur.get("temperature_2m"),
        "feels_like_c": cur.get("apparent_temperature"),
        "humidity_pct": cur.get("relative_humidity_2m"),
        "precipitation_mm": cur.get("precipitation"),
        "cloud_cover_pct": cur.get("cloud_cover"),
        "wind_speed_kmh": cur.get("wind_speed_10m"),
        "wind_direction_deg": cur.get("wind_direction_10m"),
        "wind_gusts_kmh": cur.get("wind_gusts_10m"),
        "pressure_hpa": cur.get("surface_pressure"),
        "is_day": bool(cur.get("is_day", 1)),
        "weather_code": cur.get("weather_code"),
    }
    hourly_block = payload.get("hourly", {})
    times = hourly_block.get("time", [])
    now_hour = (cur.get("time") or "")[:13]
    start = next((i for i, t in enumerate(times) if t[:13] >= now_hour), 0) if now_hour else 0
    hourly = [
        {
            "time": times[i],
            "temperature_c": _col(hourly_block, "temperature_2m", i),
            "precipitation_mm": _col(hourly_block, "precipitation", i),
            "precipitation_probability_pct": _col(hourly_block, "precipitation_probability", i),
            "wind_speed_kmh": _col(hourly_block, "wind_speed_10m", i),
            "cloud_cover_pct": _col(hourly_block, "cloud_cover", i),
            "humidity_pct": _col(hourly_block, "relative_humidity_2m", i),
        }
        for i in range(start, min(start + 48, len(times)))
    ]
    today = date.fromisoformat(cur["time"][:10]) if cur.get("time") else None
    return {
        "timezone": payload.get("timezone", "UTC"),
        "location": {"lat": payload.get("latitude"), "lon": payload.get("longitude")},
        "current": current,
        "hourly": hourly,
        "daily": normalize_daily(payload.get("daily", {}), today),
    }


class OpenMeteoWeather:
    name = "open-meteo"
    forecast_horizon_days = 16

    def __init__(self, client: ResilientClient | None = None, archive_client: ResilientClient | None = None):
        self.settings = get_settings()
        self.client = client or ResilientClient("open-meteo-forecast")
        self.archive_client = archive_client or ResilientClient("open-meteo-archive")

    def _key(self, params: dict[str, Any]) -> dict[str, Any]:
        if self.settings.open_meteo_api_key:
            params["apikey"] = self.settings.open_meteo_api_key
        return params

    def forecast(self, lat: float, lon: float) -> ProviderResult:
        params = self._key({
            "latitude": lat, "longitude": lon, "timezone": "auto", "past_days": 7,
            "forecast_days": self.forecast_horizon_days, "wind_speed_unit": "kmh",
            "current": ",".join(CURRENT_VARS), "hourly": ",".join(HOURLY_VARS), "daily": ",".join(DAILY_VARS),
        })
        payload = self.client.get_json(self.settings.open_meteo_forecast_url, params)
        if "daily" not in payload or "current" not in payload:
            raise ProviderError(self.name, "unexpected forecast payload")
        return ProviderResult(
            normalized=normalize_forecast(payload), raw=payload, provider=self.name,
            dataset="Open-Meteo Forecast API (best-match models)", retrieved_at=datetime.now(UTC),
            resolution="model-dependent, ~1–11 km", license=LICENSE, attribution=ATTRIBUTION,
            notes=["Past 7 days in this bundle are model analysis, not station measurements."],
        )

    def history(self, lat: float, lon: float, start: date, end: date) -> ProviderResult:
        params = self._key({
            "latitude": lat, "longitude": lon, "timezone": "auto", "wind_speed_unit": "kmh",
            "start_date": start.isoformat(), "end_date": end.isoformat(), "daily": ",".join(ARCHIVE_DAILY_VARS),
        })
        payload = self.archive_client.get_json(self.settings.open_meteo_archive_url, params)
        if "daily" not in payload:
            raise ProviderError(self.name, "unexpected archive payload")
        return ProviderResult(
            normalized=normalize_daily(payload["daily"], today=None), raw=None, provider=self.name,
            dataset="Open-Meteo Historical Weather API (ERA5/ERA5-Land reanalysis)",
            retrieved_at=datetime.now(UTC), resolution="~9–25 km reanalysis grid", license=LICENSE,
            attribution=ATTRIBUTION, notes=["Reanalysis estimates, not a local weather-station record."],
        )


class OpenMeteoElevation:
    name = "open-meteo-elevation"

    def __init__(self, client: ResilientClient | None = None):
        self.settings = get_settings()
        self.client = client or ResilientClient(self.name)

    def elevations(self, points: list[tuple[float, float]]) -> ProviderResult:
        points = points[:100]  # API limit per request
        payload = self.client.get_json(self.settings.open_meteo_elevation_url, {
            "latitude": ",".join(f"{p[0]:.6f}" for p in points),
            "longitude": ",".join(f"{p[1]:.6f}" for p in points),
        })
        values = payload.get("elevation")
        if not isinstance(values, list) or len(values) != len(points):
            raise ProviderError(self.name, "unexpected elevation payload")
        return ProviderResult(
            normalized=values, raw=payload, provider="open-meteo", dataset="Copernicus DEM GLO-90",
            retrieved_at=datetime.now(UTC), resolution="90 m", license="Copernicus DEM licence",
            attribution="Copernicus DEM via Open-Meteo.com",
        )
