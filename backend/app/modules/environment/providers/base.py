"""Provider protocols. Business logic depends on these, not on concrete adapters."""

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Protocol


@dataclass
class ProviderResult:
    normalized: Any
    raw: Any
    provider: str
    dataset: str
    retrieved_at: datetime
    resolution: str | None = None
    license: str | None = None
    attribution: str | None = None
    notes: list[str] = field(default_factory=list)


class WeatherProvider(Protocol):
    name: str
    forecast_horizon_days: int

    def forecast(self, lat: float, lon: float) -> ProviderResult:
        """current + 48h hourly + daily (past 7 days and forecast horizon)."""

    def history(self, lat: float, lon: float, start: date, end: date) -> ProviderResult:
        """Daily observed/reanalysis series (inclusive)."""


class ElevationProvider(Protocol):
    name: str

    def elevations(self, points: list[tuple[float, float]]) -> ProviderResult:
        """points are (lat, lon); normalized is a list of metres in the same order."""


class SoilProvider(Protocol):
    name: str

    def profile(self, lat: float, lon: float) -> ProviderResult: ...


class Geocoder(Protocol):
    def search(self, query: str) -> list[dict[str, Any]]: ...

    def reverse(self, lat: float, lon: float) -> dict[str, Any]: ...
