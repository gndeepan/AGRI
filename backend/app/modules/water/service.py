"""Nearby water sources for a field: OSM features within a radius, measured from the field boundary."""

import hashlib
import logging
import math
from datetime import UTC, datetime, timedelta
from typing import Any

from pyproj import CRS, Transformer
from shapely.geometry import LineString, MultiLineString, Point, Polygon, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import linemerge, nearest_points, polygonize, transform, unary_union

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.http import ProviderError
from app.core.redis import cache_get_json, cache_set_json
from app.modules.water.classify import classify, compass, is_seasonal
from app.modules.water.overpass import OverpassClient

log = logging.getLogger(__name__)

DEFAULT_RADIUS_M = 5000
MAX_RADIUS_M = 15000
MAX_RESULTS = 60
MAX_DRAINS = 8
LINEAR = {"river", "canal", "stream", "drain"}
CAVEAT = ("OpenStreetMap coverage of village tanks, ponds and wells varies, and mapped water bodies may be dry "
          "outside the monsoon. Check on the ground before planning irrigation.")


class _Projector:
    """Local azimuthal-equidistant projection in metres around the field centroid."""

    def __init__(self, lat0: float, lon0: float):
        local = CRS.from_proj4(f"+proj=aeqd +lat_0={lat0} +lon_0={lon0} +datum=WGS84 +units=m")
        self._fwd = Transformer.from_crs("EPSG:4326", local, always_xy=True)
        self._inv = Transformer.from_crs(local, "EPSG:4326", always_xy=True)

    def fwd(self, geom: BaseGeometry) -> BaseGeometry:
        return transform(self._fwd.transform, geom)

    def inv(self, geom: BaseGeometry) -> BaseGeometry:
        return transform(self._inv.transform, geom)

    def latlon(self, p: Point) -> dict[str, float]:
        lon, lat = self._inv.transform(p.x, p.y)
        return {"lat": round(lat, 6), "lon": round(lon, 6)}


def search_bbox(field: Polygon, radius_m: float) -> tuple[float, float, float, float]:
    """(south, west, north, east) covering the field plus the radius."""
    minx, miny, maxx, maxy = field.bounds
    dlat = radius_m / 111_320
    dlon = radius_m / (111_320 * max(0.2, math.cos(math.radians((miny + maxy) / 2))))
    return miny - dlat, minx - dlon, maxy + dlat, maxx + dlon


def _coords(geometry: list[dict[str, float]]) -> list[tuple[float, float]]:
    return [(p["lon"], p["lat"]) for p in geometry if p]


def element_geometry(el: dict[str, Any]) -> BaseGeometry | None:
    """Overpass `out geom` element → WGS84 shapely geometry (Point, LineString, Polygon/MultiPolygon)."""
    tags = el.get("tags", {})
    if el["type"] == "node":
        return Point(el["lon"], el["lat"])
    if el["type"] == "way":
        pts = _coords(el.get("geometry", []))
        if len(pts) < 2:
            return None
        closed = len(pts) >= 4 and pts[0] == pts[-1]
        if closed and "waterway" not in tags:
            poly = Polygon(pts)
            return poly if poly.is_valid else poly.buffer(0)
        return LineString(pts)
    if el["type"] == "relation":
        outer = [LineString(_coords(m["geometry"])) for m in el.get("members", [])
                 if m.get("type") == "way" and m.get("role") in ("outer", "") and len(m.get("geometry") or []) >= 2]
        inner = [LineString(_coords(m["geometry"])) for m in el.get("members", [])
                 if m.get("type") == "way" and m.get("role") == "inner" and len(m.get("geometry") or []) >= 2]
        if not outer:
            return None
        if "waterway" in tags:
            return linemerge(MultiLineString(outer))
        polys = list(polygonize(unary_union(outer)))
        if not polys:
            return None
        area = unary_union(polys)
        holes = list(polygonize(unary_union(inner))) if inner else []
        return area.difference(unary_union(holes)) if holes else area
    return None


def _merge_linear(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Rivers and canals arrive as many way segments; merge named segments of the same kind."""
    merged: dict[tuple[str, str], dict[str, Any]] = {}
    out = []
    for it in items:
        if it["kind"] in LINEAR and it["name"]:
            key = (it["kind"], it["name"].strip().lower())
            if key in merged:
                m = merged[key]
                m["geom"] = unary_union([m["geom"], it["geom"]])
                m["seasonal"] = m["seasonal"] and it["seasonal"]
                m["osm_ids"].extend(it["osm_ids"])
                continue
            merged[key] = it
        out.append(it)
    return out


def _round_geojson(geom: BaseGeometry) -> dict[str, Any]:
    def rnd(c: Any) -> Any:
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
            return [round(c[0], 6), round(c[1], 6)]
        return [rnd(x) for x in c]

    g = mapping(geom)
    return {"type": g["type"], "coordinates": rnd(g["coordinates"])}


def analyse(field_geojson: dict[str, Any], elements: list[dict[str, Any]], radius_m: float) -> list[dict[str, Any]]:
    """Pure: classify, measure from the field boundary, merge, sort. Distances are geodesic-equivalent
    (local equidistant projection centred on the field, accurate to well under 1% within 15 km)."""
    field_ll = shape(field_geojson)
    c = field_ll.centroid
    proj = _Projector(c.y, c.x)
    field = proj.fwd(field_ll)
    reach = field.buffer(radius_m)
    clip = field.buffer(radius_m * 1.15)

    items: list[dict[str, Any]] = []
    for el in elements:
        tags = el.get("tags") or {}
        try:
            geom_ll = element_geometry(el)
        except Exception:  # noqa: BLE001 - one malformed OSM feature must not fail the whole lookup
            log.info("skipping malformed OSM element", extra={"osm": f"{el.get('type')}/{el.get('id')}"})
            continue
        if geom_ll is None or geom_ll.is_empty:
            continue
        geom = proj.fwd(geom_ll)
        if not geom.intersects(reach):
            continue
        area = geom.area if geom.geom_type in ("Polygon", "MultiPolygon") else None
        kind = classify(tags, area)
        if kind is None:
            continue
        items.append({
            "kind": kind, "tags": tags, "geom": geom, "seasonal": is_seasonal(tags),
            "name": tags.get("name") or tags.get("name:en") or tags.get("name:ta"),
            "osm_ids": [f"{el['type']}/{el['id']}"],
        })

    results = []
    for it in _merge_linear(items):
        geom = it["geom"]
        f_pt, w_pt = nearest_points(field, geom)
        distance = field.distance(geom)
        if distance > radius_m:
            continue
        if distance < 0.5:
            target = geom.representative_point() if geom.geom_type != "Point" else geom
            dx, dy = target.x - field.centroid.x, target.y - field.centroid.y
        else:
            dx, dy = w_pt.x - f_pt.x, w_pt.y - f_pt.y
        bearing = (math.degrees(math.atan2(dx, dy)) + 360) % 360 if (dx or dy) else None
        polygonal = geom.geom_type in ("Polygon", "MultiPolygon")
        linear = geom.geom_type in ("LineString", "MultiLineString")
        shown = geom.intersection(clip) if not geom.within(clip) else geom
        shown = shown.simplify(2.0 if polygonal else 3.0, preserve_topology=True)
        tags = it["tags"]
        primary = it["osm_ids"][0]
        results.append({
            "id": primary,
            "osm_ids": it["osm_ids"],
            "osm_url": f"https://www.openstreetmap.org/{primary}",
            "name": it["name"],
            "name_ta": tags.get("name:ta"),
            "kind": it["kind"],
            "seasonal": it["seasonal"],
            "distance_m": round(distance, 1),
            "adjoining": distance < 0.5,
            "bearing_deg": round(bearing, 1) if bearing is not None else None,
            "direction": compass(bearing) if bearing is not None else None,
            "area_m2": round(geom.area, 1) if polygonal else None,
            "length_in_radius_m": round(geom.intersection(reach).length, 1) if linear else None,
            "nearest_point": proj.latlon(w_pt),
            "field_point": proj.latlon(f_pt),
            "geometry": _round_geojson(proj.inv(shown)) if not shown.is_empty else _round_geojson(proj.inv(w_pt)),
        })

    results.sort(key=lambda r: r["distance_m"])
    drains = 0
    trimmed = []
    for r in results:
        if r["kind"] == "drain":
            drains += 1
            if drains > MAX_DRAINS:
                continue
        trimmed.append(r)
    return trimmed[:MAX_RESULTS]


def _summary(sources: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    nearest: dict[str, dict[str, Any]] = {}
    for s in sources:
        counts[s["kind"]] = counts.get(s["kind"], 0) + 1
        if s["kind"] not in nearest:
            nearest[s["kind"]] = {"id": s["id"], "name": s["name"], "distance_m": s["distance_m"],
                                  "direction": s["direction"]}
    return {"counts_by_kind": counts, "nearest_by_kind": nearest}


class WaterService:
    def __init__(self, client: OverpassClient | None = None):
        self.client = client
        self.settings = get_settings()

    @staticmethod
    def cache_key(land_id: Any, field_geojson: dict[str, Any], radius_m: int) -> str:
        digest = hashlib.sha1(repr(field_geojson["coordinates"]).encode()).hexdigest()[:12]
        return f"water:v1:{land_id}:{digest}:{radius_m}"

    def cached(self, land_id: Any, field_geojson: dict[str, Any], radius_m: int = DEFAULT_RADIUS_M) -> dict | None:
        """Cached result only — never calls the provider (used by the assistant context)."""
        return cache_get_json(self.cache_key(land_id, field_geojson, radius_m))

    def nearby(self, land_id: Any, field_geojson: dict[str, Any], radius_m: int = DEFAULT_RADIUS_M) -> dict[str, Any]:
        radius_m = int(min(max(radius_m, 500), MAX_RADIUS_M))
        key = self.cache_key(land_id, field_geojson, radius_m)
        fresh_for = timedelta(days=self.settings.water_cache_days)
        cached = cache_get_json(key)
        if cached is not None:
            age = datetime.now(UTC) - datetime.fromisoformat(cached["provenance"]["retrieved_at"])
            if age < fresh_for:
                return {**cached, "provenance": {**cached["provenance"], "cache_status": "cached"}}

        bbox = search_bbox(shape(field_geojson), radius_m)
        try:
            elements = (self.client or OverpassClient()).water_features(bbox)
        except ProviderError as exc:
            log.warning("overpass unavailable", extra={"error": str(exc)})
            if cached is not None:
                return {**cached, "provenance": {**cached["provenance"], "cache_status": "stale"}}
            raise AppError(503, "Nearby water lookup (OpenStreetMap) is unavailable right now. Try again later.",
                           "water_sources_unavailable") from exc

        sources = analyse(field_geojson, elements, radius_m)
        result = {
            "radius_m": radius_m,
            "sources": sources,
            **_summary(sources),
            "provenance": {
                "provider": "openstreetmap-overpass", "dataset": "OpenStreetMap (Overpass API)",
                "kind": "estimate", "retrieved_at": datetime.now(UTC).isoformat(), "resolution": None,
                "license": "ODbL 1.0", "attribution": "© OpenStreetMap contributors",
                "cache_status": "fresh", "notes": [CAVEAT],
            },
            "limitations": [
                CAVEAT,
                "Distances are measured from your drawn field boundary to the nearest mapped edge of each water body.",
                "Swimming pools, water parks, wastewater and culverted (underground) channels are excluded.",
            ],
        }
        cache_set_json(key, result, int(fresh_for.total_seconds()) * 4)
        return result
