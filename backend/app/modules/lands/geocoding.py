"""OSM Nominatim proxy: cached, max 1 request/second across processes (usage policy)."""

import hashlib
import time
from typing import Any

import redis

from app.core.config import get_settings
from app.core.http import ProviderError, ResilientClient
from app.core.redis import cache_get_json, cache_set_json, get_redis

CACHE_TTL_S = 7 * 24 * 3600
LOCK_KEY = "nominatim:throttle"


def _throttle(max_wait_s: float = 5.0) -> None:
    deadline = time.monotonic() + max_wait_s
    while True:
        try:
            if get_redis().set(LOCK_KEY, "1", nx=True, px=1000):
                return
        except redis.RedisError:
            return
        if time.monotonic() > deadline:
            raise ProviderError("nominatim", "geocoder busy, try again")
        time.sleep(0.1)


def _address_parts(address: dict[str, Any]) -> dict[str, str | None]:
    return {
        "village": address.get("village") or address.get("hamlet") or address.get("town")
        or address.get("suburb") or address.get("city"),
        "district": address.get("state_district") or address.get("county") or address.get("city_district"),
        "state": address.get("state"),
    }


class NominatimGeocoder:
    def __init__(self, client: ResilientClient | None = None):
        self.base = get_settings().nominatim_url.rstrip("/")
        self.client = client or ResilientClient("nominatim", retries=2)

    def search(self, query: str) -> list[dict[str, Any]]:
        q = query.strip()
        key = "geo:search:" + hashlib.sha1(q.lower().encode()).hexdigest()
        if (cached := cache_get_json(key)) is not None:
            return cached
        _throttle()
        data = self.client.get_json(f"{self.base}/search", {
            "q": q, "format": "jsonv2", "addressdetails": 1, "limit": 8,
        })
        results = []
        for item in data if isinstance(data, list) else []:
            bbox = item.get("boundingbox")
            results.append({
                "name": item.get("name") or item.get("display_name", "").split(",")[0],
                "display_name": item.get("display_name"),
                "lat": float(item["lat"]),
                "lon": float(item["lon"]),
                # Nominatim bbox is [minLat, maxLat, minLon, maxLon]; contract wants [minLon, minLat, maxLon, maxLat]
                "bbox": [float(bbox[2]), float(bbox[0]), float(bbox[3]), float(bbox[1])] if bbox else None,
                "kind": item.get("addresstype") or item.get("type"),
            })
        cache_set_json(key, results, CACHE_TTL_S)
        return results

    def reverse(self, lat: float, lon: float) -> dict[str, Any]:
        key = f"geo:reverse:{lat:.4f}:{lon:.4f}"
        if (cached := cache_get_json(key)) is not None:
            return cached
        _throttle()
        data = self.client.get_json(f"{self.base}/reverse", {
            "lat": lat, "lon": lon, "format": "jsonv2", "zoom": 14, "addressdetails": 1,
        })
        result = {**_address_parts(data.get("address", {})), "display_name": data.get("display_name")}
        cache_set_json(key, result, CACHE_TTL_S)
        return result
