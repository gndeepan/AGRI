"""Environmental intelligence: weather, history, climatology, soil and terrain with
provenance, Redis caching, DB persistence and graceful degradation."""

import logging
import math
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.http import ProviderError
from app.core.redis import cache_get_json, cache_set_json
from app.modules.environment.alerts import forecast_alerts
from app.modules.environment.climatology import build_climatology, climatology_day, climatology_period
from app.modules.environment.models import (
    EnvironmentalObservation,
    SoilProfile,
    WeatherForecast,
)
from app.modules.environment.providers.base import ElevationProvider, ProviderResult, SoilProvider, WeatherProvider
from app.modules.environment.providers.open_meteo import OpenMeteoElevation, OpenMeteoWeather
from app.modules.environment.providers.soilgrids import SoilGridsProvider
from app.modules.lands.geo import GEOD

log = logging.getLogger(__name__)
STALE_FORECAST_HOURS = 6


def round_loc(lat: float, lon: float) -> tuple[float, float]:
    """~1 km grid so neighbouring fields share cache entries."""
    return round(lat, 2), round(lon, 2)


def provenance(result: ProviderResult, kind: str, cache_status: str = "fresh",
               extra_notes: list[str] | None = None) -> dict[str, Any]:
    return {
        "provider": result.provider,
        "dataset": result.dataset,
        "kind": kind,
        "retrieved_at": result.retrieved_at.isoformat(),
        "resolution": result.resolution,
        "license": result.license,
        "attribution": result.attribution,
        "cache_status": cache_status,
        "notes": list(result.notes) + (extra_notes or []),
    }


def _result_from_cache(data: dict) -> ProviderResult:
    p = data["provenance"]
    return ProviderResult(
        normalized=data["normalized"], raw=None, provider=p["provider"], dataset=p["dataset"],
        retrieved_at=datetime.fromisoformat(p["retrieved_at"]), resolution=p.get("resolution"),
        license=p.get("license"), attribution=p.get("attribution"), notes=p.get("notes", []),
    )


def merge_daily(start: date, end: date, *sources: list[dict]) -> list[dict | None]:
    """Earlier sources take precedence. Returns one entry (or None) per date."""
    by_date: dict[str, dict] = {}
    for rows in sources:
        for row in rows:
            by_date.setdefault(row["date"], row)
    out = []
    d = start
    while d <= end:
        out.append(by_date.get(d.isoformat()))
        d += timedelta(days=1)
    return out


class EnvironmentService:
    def __init__(self, db: Session | None = None, weather: WeatherProvider | None = None,
                 elevation: ElevationProvider | None = None, soil: SoilProvider | None = None):
        self.db = db
        self.settings = get_settings()
        self.weather = weather or OpenMeteoWeather()
        self.elevation = elevation or OpenMeteoElevation()
        self.soil = soil or SoilGridsProvider()

    # ---------- forecast ----------
    def weather_bundle(self, lat: float, lon: float, land_id: uuid.UUID | None = None) -> dict[str, Any]:
        rlat, rlon = round_loc(lat, lon)
        key = f"wx:fc:{rlat}:{rlon}"
        cached = cache_get_json(key)
        if cached:
            return self._bundle(cached["normalized"], {**cached["provenance"], "cache_status": "cached"})
        try:
            result = self.weather.forecast(rlat, rlon)
        except ProviderError as exc:
            log.warning("forecast provider failed, trying stored forecast", extra={"error": str(exc)})
            return self._stale_bundle(rlat, rlon, exc)
        prov = provenance(result, "forecast")
        cache_set_json(key, {"normalized": result.normalized, "provenance": prov},
                       self.settings.weather_cache_minutes * 60)
        if self.db is not None:
            self.db.add(WeatherForecast(
                land_id=land_id, provider=result.provider, lat=rlat, lon=rlon, retrieved_at=result.retrieved_at,
                valid_until=result.retrieved_at + timedelta(minutes=self.settings.weather_cache_minutes),
                normalized=result.normalized, raw=result.raw,
            ))
            self.db.commit()
        return self._bundle(result.normalized, prov)

    def _stale_bundle(self, lat: float, lon: float, exc: Exception) -> dict[str, Any]:
        row = None
        if self.db is not None:
            row = self.db.scalars(
                select(WeatherForecast).where(WeatherForecast.lat == lat, WeatherForecast.lon == lon)
                .order_by(WeatherForecast.retrieved_at.desc()).limit(1)
            ).first()
        if row is None:
            raise AppError(503, "Weather provider is unavailable and no stored forecast exists.",
                           "provider_unavailable") from exc
        age_h = (datetime.now(UTC) - row.retrieved_at).total_seconds() / 3600
        prov = {
            "provider": row.provider, "dataset": "Open-Meteo Forecast API (stored copy)", "kind": "forecast",
            "retrieved_at": row.retrieved_at.isoformat(), "resolution": None, "license": "CC BY 4.0",
            "attribution": "Weather data by Open-Meteo.com", "cache_status": "stale",
            "notes": [f"Live provider unavailable; showing forecast retrieved {age_h:.1f} h ago."],
        }
        return self._bundle(row.normalized, prov)

    @staticmethod
    def _bundle(normalized: dict, prov: dict) -> dict[str, Any]:
        cur_time = normalized["current"].get("time")
        today = date.fromisoformat(cur_time[:10]) if cur_time else date.today()
        return {
            "location": normalized["location"],
            "timezone": normalized["timezone"],
            "current": normalized["current"],
            "hourly": normalized["hourly"],
            "daily": normalized["daily"],
            "alerts": forecast_alerts(normalized["daily"], today),
            "provenance": prov,
        }

    # ---------- history / climatology ----------
    def history(self, lat: float, lon: float, start: date, end: date,
                land_id: uuid.UUID | None = None) -> tuple[list[dict], dict | None]:
        rlat, rlon = round_loc(lat, lon)
        key = f"wx:hist:{rlat}:{rlon}:{start}:{end}"
        if cached := cache_get_json(key):
            return cached["normalized"], {**cached["provenance"], "cache_status": "cached"}
        result = self.weather.history(rlat, rlon, start, end)
        prov = provenance(result, "observed")
        cache_set_json(key, {"normalized": result.normalized, "provenance": prov}, 24 * 3600)
        if self.db is not None:
            self.db.add(EnvironmentalObservation(
                land_id=land_id, provider=result.provider, dataset=result.dataset, kind="observed",
                lat=rlat, lon=rlon, start_date=start, end_date=end, normalized=result.normalized, raw=None,
                retrieved_at=result.retrieved_at,
            ))
            self.db.commit()
        return result.normalized, prov

    def climatology(self, lat: float, lon: float) -> tuple[dict, dict]:
        rlat, rlon = round_loc(lat, lon)
        key = f"wx:clim:{rlat}:{rlon}"
        if cached := cache_get_json(key):
            return cached["normalized"], {**cached["provenance"], "cache_status": "cached"}
        start, end = climatology_period(date.today(), self.settings.climatology_years)
        result = self.weather.history(rlat, rlon, start, end)
        clim = build_climatology(result.normalized)
        prov = provenance(result, "climatology", extra_notes=[
            f"{self.settings.climatology_years}-year mean for each calendar day ({start}–{end}); "
            "an estimate of typical conditions, not a forecast."
        ])
        cache_set_json(key, {"normalized": clim, "provenance": prov}, 30 * 24 * 3600)
        if self.db is not None:
            self.db.add(EnvironmentalObservation(
                provider=result.provider, dataset=result.dataset, kind="climatology", lat=rlat, lon=rlon,
                start_date=start, end_date=end, normalized=clim, raw=None, retrieved_at=result.retrieved_at,
            ))
            self.db.commit()
        return clim, prov

    def daily_series(self, lat: float, lon: float, start: date, end: date,
                     land_id: uuid.UUID | None = None) -> tuple[list[dict | None], list[dict]]:
        """One row per date: forecast-bundle (recent observed + forecast) > archive > climatology.
        Missing providers degrade to the next source; dates with no data are None."""
        provenances: list[dict] = []
        bundle_rows: list[dict] = []
        today = date.today()
        try:
            bundle = self.weather_bundle(lat, lon, land_id)
            bundle_rows = bundle["daily"]
            provenances.append(bundle["provenance"])
            if bundle["current"].get("time"):
                today = date.fromisoformat(bundle["current"]["time"][:10])
        except AppError:
            pass

        archive_rows: list[dict] = []
        archive_end = min(end, today - timedelta(days=6))
        if start <= archive_end:
            try:
                archive_rows, prov = self.history(lat, lon, start, archive_end, land_id)
                if prov:
                    provenances.append(prov)
            except ProviderError as exc:
                log.warning("archive unavailable", extra={"error": str(exc)})

        merged = merge_daily(start, end, bundle_rows, archive_rows)
        if any(r is None for r in merged):
            try:
                clim, prov = self.climatology(lat, lon)
                provenances.append(prov)
                d = start
                for i, row in enumerate(merged):
                    if row is None:
                        merged[i] = climatology_day(clim, d)
                    d += timedelta(days=1)
            except ProviderError as exc:
                log.warning("climatology unavailable", extra={"error": str(exc)})
        return merged, provenances

    # ---------- soil / terrain ----------
    def soil_profile(self, lat: float, lon: float, land_id: uuid.UUID | None = None) -> dict[str, Any]:
        rlat, rlon = round(lat, 3), round(lon, 3)  # 250 m grid → ~100 m rounding
        key = f"soil:{rlat}:{rlon}"
        if cached := cache_get_json(key):
            return {**cached["normalized"], "provenance": {**cached["provenance"], "cache_status": "cached"}}
        try:
            result = self.soil.profile(rlat, rlon)
        except ProviderError as exc:
            stored = self._stored_soil(rlat, rlon)
            if stored:
                return stored
            raise AppError(503, "Soil data provider is unavailable. You can still enter soil-test results.",
                           "provider_unavailable") from exc
        prov = provenance(result, "modelled")
        cache_set_json(key, {"normalized": result.normalized, "provenance": prov},
                       self.settings.soil_cache_days * 24 * 3600)
        if self.db is not None:
            self.db.add(SoilProfile(
                land_id=land_id, provider=result.provider, dataset=result.dataset, lat=rlat, lon=rlon,
                resolution=result.resolution, normalized=result.normalized, raw=result.raw,
                retrieved_at=result.retrieved_at,
            ))
            self.db.commit()
        return {**result.normalized, "provenance": prov}

    def _stored_soil(self, lat: float, lon: float) -> dict[str, Any] | None:
        if self.db is None:
            return None
        row = self.db.scalars(
            select(SoilProfile).where(SoilProfile.lat == lat, SoilProfile.lon == lon)
            .order_by(SoilProfile.retrieved_at.desc()).limit(1)
        ).first()
        if row is None:
            return None
        return {**row.normalized, "provenance": {
            "provider": row.provider, "dataset": row.dataset, "kind": "modelled",
            "retrieved_at": row.retrieved_at.isoformat(), "resolution": row.resolution, "license": "CC BY 4.0",
            "attribution": "ISRIC — World Soil Information, SoilGrids 2.0", "cache_status": "stale",
            "notes": ["Live provider unavailable; showing previously retrieved estimate."],
        }}

    def terrain(self, centroid: tuple[float, float], vertices: list[tuple[float, float]]) -> dict[str, Any]:
        """centroid/vertices as (lat, lon)."""
        points = [centroid] + vertices[:99]
        result = self.elevation.elevations(points)
        values = result.normalized
        elev = values[0]
        valid = [(p, v) for p, v in zip(points, values, strict=True) if v is not None]
        relief = slope = None
        if len(valid) >= 2:
            (p_hi, hi), (p_lo, lo) = max(valid, key=lambda x: x[1]), min(valid, key=lambda x: x[1])
            relief = round(hi - lo, 1)
            _, _, dist = GEOD.inv(p_hi[1], p_hi[0], p_lo[1], p_lo[0])
            slope = round(math.degrees(math.atan2(relief, dist)), 2) if dist > 0 else 0.0
        return {
            "elevation_m": elev,
            "slope_deg": slope,
            "relief_m": relief,
            "provenance": provenance(result, "modelled", extra_notes=[
                "Approximate: a 90 m elevation grid cannot resolve slope within a small field."
            ]),
        }
