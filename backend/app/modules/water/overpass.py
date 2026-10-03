"""OpenStreetMap Overpass API adapter (ODbL). Fair use: one bbox query per field, cached for days."""

from typing import Any

from app.core.config import get_settings
from app.core.http import ResilientClient

PROVIDER = "overpass"


def build_query(bbox: tuple[float, float, float, float], timeout_s: int = 25) -> str:
    """bbox = (south, west, north, east)."""
    s, w, n, e = (round(v, 5) for v in bbox)
    return (
        f"[out:json][timeout:{timeout_s}][bbox:{s},{w},{n},{e}];"
        "(nwr[natural=water];"
        'way[waterway~"^(river|stream|canal|drain|ditch)$"];'
        'nwr[landuse~"^(reservoir|basin)$"];'
        "node[man_made=water_well];);"
        "out geom qt;"
    )


class OverpassClient:
    def __init__(self, client: ResilientClient | None = None):
        self.url = get_settings().overpass_url
        # Busy public instances answer 429/504; retry a little, then let the breaker protect them.
        self.client = client or ResilientClient(PROVIDER, retries=2, backoff_base_s=2.0, timeout_s=45)

    def water_features(self, bbox: tuple[float, float, float, float]) -> list[dict[str, Any]]:
        data = self.client.get_json(self.url, {"data": build_query(bbox)})
        return data.get("elements", []) if isinstance(data, dict) else []
