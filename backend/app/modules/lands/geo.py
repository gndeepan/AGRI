"""Polygon validation and geodesic metrics. Pure functions — no DB or network."""

from dataclasses import dataclass
from typing import Any

from pyproj import CRS, Geod, Transformer
from shapely import validation
from shapely.geometry import Polygon, mapping
from shapely.geometry.polygon import orient
from shapely.ops import transform

GEOD = Geod(ellps="WGS84")
MIN_AREA_M2 = 10.0
MAX_AREA_M2 = 10_000_000.0  # 10 km²
SQM_PER_ACRE = 4046.8564224

BOUNDARY_DISCLAIMER = (
    "Boundary drawn on satellite imagery by the user. Area and coordinates are geodesic "
    "calculations of this drawing and are not a legal or cadastral survey."
)


class GeometryError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class LandMetrics:
    area_m2: float
    area_ha: float
    area_acres: float
    perimeter_m: float
    centroid: dict[str, float]
    representative_point: dict[str, float]
    bbox: list[float]
    vertex_count: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "area_m2": self.area_m2,
            "area_ha": self.area_ha,
            "area_acres": self.area_acres,
            "perimeter_m": self.perimeter_m,
            "centroid": self.centroid,
            "representative_point": self.representative_point,
            "bbox": self.bbox,
            "vertex_count": self.vertex_count,
        }


def _clean_ring(ring: Any, label: str) -> list[tuple[float, float]]:
    if not isinstance(ring, list) or not ring:
        raise GeometryError("invalid_geometry", f"{label} must be a list of [lon, lat] positions")
    out: list[tuple[float, float]] = []
    for pos in ring:
        if not isinstance(pos, (list, tuple)) or len(pos) < 2:
            raise GeometryError("invalid_geometry", "Each position must be [lon, lat]")
        lon, lat = pos[0], pos[1]
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (lon, lat)):
            raise GeometryError("invalid_geometry", "Coordinates must be numbers")
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise GeometryError("out_of_range", f"Coordinate out of range: [{lon}, {lat}]")
        point = (float(lon), float(lat))
        if not out or out[-1] != point:  # drop consecutive duplicates
            out.append(point)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    if len(set(out)) < 3:
        raise GeometryError("too_few_vertices", f"{label} needs at least 3 distinct vertices")
    return out + [out[0]]


def parse_polygon(geojson: Any) -> Polygon:
    if not isinstance(geojson, dict) or geojson.get("type") != "Polygon":
        raise GeometryError("not_polygon", "Boundary must be a GeoJSON Polygon")
    rings = geojson.get("coordinates")
    if not isinstance(rings, list) or not rings:
        raise GeometryError("invalid_geometry", "Polygon has no coordinates")
    shell = _clean_ring(rings[0], "Outer boundary")
    holes = [_clean_ring(r, "Inner ring") for r in rings[1:]]
    poly = Polygon(shell, holes)
    if not poly.is_valid:
        reason = validation.explain_validity(poly)
        raise GeometryError("invalid_geometry", f"Boundary is not a valid polygon: {reason}")
    return poly


def _local_projection(poly: Polygon) -> tuple[Transformer, Transformer]:
    minx, miny, maxx, maxy = poly.bounds
    lon0, lat0 = (minx + maxx) / 2, (miny + maxy) / 2
    local = CRS.from_proj4(f"+proj=aeqd +lat_0={lat0} +lon_0={lon0} +datum=WGS84 +units=m")
    fwd = Transformer.from_crs("EPSG:4326", local, always_xy=True)
    inv = Transformer.from_crs(local, "EPSG:4326", always_xy=True)
    return fwd, inv


def compute_metrics(poly: Polygon) -> LandMetrics:
    # pyproj sums signed ring areas: exterior must be CCW and holes CW for holes to subtract.
    area, _ = GEOD.geometry_area_perimeter(orient(poly, sign=1.0))
    area_m2 = abs(area)
    perimeter_m = GEOD.geometry_length(poly.exterior)
    if area_m2 < MIN_AREA_M2:
        raise GeometryError("too_small", f"Area {area_m2:.1f} m² is below the {MIN_AREA_M2:.0f} m² minimum")
    if area_m2 > MAX_AREA_M2:
        raise GeometryError("too_large", "Area exceeds 10 km²; split large holdings into separate fields")

    fwd, inv = _local_projection(poly)
    projected = transform(fwd.transform, poly)
    c = projected.centroid
    r = projected.representative_point()
    c_lon, c_lat = inv.transform(c.x, c.y)
    r_lon, r_lat = inv.transform(r.x, r.y)
    minx, miny, maxx, maxy = poly.bounds
    return LandMetrics(
        area_m2=round(area_m2, 2),
        area_ha=round(area_m2 / 10_000, 4),
        area_acres=round(area_m2 / SQM_PER_ACRE, 4),
        perimeter_m=round(perimeter_m, 2),
        centroid={"lat": round(c_lat, 7), "lon": round(c_lon, 7)},
        representative_point={"lat": round(r_lat, 7), "lon": round(r_lon, 7)},
        bbox=[round(minx, 7), round(miny, 7), round(maxx, 7), round(maxy, 7)],
        vertex_count=len(poly.exterior.coords) - 1,
    )


def validate_and_measure(geojson: Any) -> tuple[Polygon, LandMetrics]:
    poly = parse_polygon(geojson)
    return poly, compute_metrics(poly)


def polygon_to_geojson(poly: Polygon) -> dict[str, Any]:
    geo = mapping(poly)
    return {"type": "Polygon", "coordinates": [[list(p) for p in ring] for ring in geo["coordinates"]]}
