"""Water-source detection: classification, geometry, distances and the Overpass adapter.
All OSM payloads below are synthetic fixtures shaped like Overpass `out geom` responses."""

import httpx
import pytest
import respx

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.http import ResilientClient
from app.modules.lands.geo import GEOD
from app.modules.water.classify import classify, compass, is_excluded, is_seasonal
from app.modules.water.overpass import OverpassClient, build_query
from app.modules.water.service import WaterService, analyse, element_geometry, search_bbox
from tests.conftest import square

LON, LAT = 79.138, 10.787
FIELD = square(LON, LAT, 100)  # synthetic 1 ha field; SW corner at LON/LAT, sides 100 m


def at(east_m: float, north_m: float) -> tuple[float, float]:
    """Point offset from the field's SW corner (lon, lat)."""
    lon, lat, _ = GEOD.fwd(LON, LAT, 90, east_m) if east_m else (LON, LAT, 0)
    lon, lat, _ = GEOD.fwd(lon, lat, 0, north_m) if north_m else (lon, lat, 0)
    return lon, lat


def pts(*offsets: tuple[float, float]) -> list[dict[str, float]]:
    return [{"lon": x, "lat": y} for x, y in (at(e, n) for e, n in offsets)]


def square_way(osm_id: int, east: float, north: float, side: float, tags: dict) -> dict:
    ring = [(east, north), (east + side, north), (east + side, north + side), (east, north + side), (east, north)]
    return {"type": "way", "id": osm_id, "tags": tags, "geometry": pts(*ring)}


def line_way(osm_id: int, offsets: list[tuple[float, float]], tags: dict) -> dict:
    return {"type": "way", "id": osm_id, "tags": tags, "geometry": pts(*offsets)}


def synthetic_elements() -> list[dict]:
    return [
        # 60 m x 60 m kanmai 400 m north of the field's north edge (field spans north 0..100 m)
        square_way(1, 20, 500, 60, {"natural": "water", "name": "Periya Kanmai"}),
        # Unnamed 20 m pond 150 m east of the east edge
        square_way(2, 250, 40, 20, {"natural": "water"}),
        # A river split into two named segments, 1 km south
        line_way(3, [(-800, -1000), (0, -1000)], {"waterway": "river", "name": "Vettar River"}),
        line_way(4, [(0, -1000), (800, -1000)], {"waterway": "river", "name": "Vettar River", "intermittent": "yes"}),
        # Well 30 m west of the field
        {"type": "node", "id": 5, "lat": at(-30, 50)[1], "lon": at(-30, 50)[0], "tags": {"man_made": "water_well"}},
        # Excluded: swimming pool, culverted drain, and a "Water Park" with only natural=water
        square_way(6, 120, 0, 10, {"leisure": "swimming_pool", "natural": "water"}),
        line_way(7, [(-100, -50), (300, -50)], {"waterway": "drain", "tunnel": "culvert"}),
        square_way(8, -200, 0, 30, {"natural": "water", "name": "Water Park"}),
        # Outside a 2 km radius: 3 km east
        square_way(9, 3100, 0, 50, {"natural": "water", "name": "Far Eri"}),
    ]


# ---------------- classification ----------------

@pytest.mark.parametrize("tags,area,kind", [
    ({"waterway": "river"}, None, "river"),
    ({"waterway": "canal"}, None, "canal"),
    ({"waterway": "ditch"}, None, "drain"),
    ({"man_made": "water_well"}, None, "well"),
    ({"natural": "water", "name": "Sivagangai Tank"}, 21_000, "tank"),
    ({"natural": "water", "name": "Vadakku Kammai"}, 5_000, "tank"),
    ({"natural": "water", "name:ta": "பெரிய ஏரி"}, 500_000, "tank"),
    ({"natural": "water", "name": "Singaperumal kulam"}, 30_000, "pond"),
    ({"natural": "water", "name": "Kovil Ooruni"}, 800, "pond"),
    ({"natural": "water", "water": "pond"}, 300, "pond"),
    ({"natural": "water"}, 5_000, "pond"),
    ({"natural": "water"}, 300_000, "tank"),
    ({"natural": "water", "water": "reservoir"}, 5_000_000, "lake"),
    ({"landuse": "reservoir"}, 60_000, "tank"),
    ({"natural": "water", "water": "lake"}, 900_000, "lake"),
])
def test_classify(tags, area, kind):
    assert classify(tags, area) == kind


@pytest.mark.parametrize("tags", [
    {"leisure": "swimming_pool", "natural": "water"},
    {"natural": "water", "sport": "swimming"},
    {"natural": "water", "water": "wastewater"},
    {"natural": "water", "name": "Water Park"},
    {"waterway": "drain", "tunnel": "culvert"},
    {"highway": "residential"},
])
def test_non_sources_are_excluded(tags):
    assert classify(tags, 1000) is None


def test_seasonal_and_compass():
    assert is_seasonal({"intermittent": "yes"}) and is_seasonal({"seasonal": "wet_season"})
    assert not is_seasonal({"seasonal": "no"}) and not is_seasonal({})
    assert is_excluded({"waterway": "stream", "tunnel": "yes"}) and not is_excluded({"natural": "water"})
    assert [compass(b) for b in (0, 44, 90, 181, 270, 359)] == ["N", "NE", "E", "S", "W", "N"]


def test_relation_multipolygon_with_split_outer_ring():
    a, b = pts((0, 0), (100, 0), (100, 100)), pts((100, 100), (0, 100), (0, 0))
    hole = pts((40, 40), (60, 40), (60, 60), (40, 60), (40, 40))
    rel = {"type": "relation", "id": 10, "tags": {"natural": "water", "type": "multipolygon"},
           "members": [{"type": "way", "role": "outer", "geometry": a}, {"type": "way", "role": "outer", "geometry": b},
                       {"type": "way", "role": "inner", "geometry": hole}]}
    geom = element_geometry(rel)
    assert geom.geom_type == "Polygon" and len(geom.interiors) == 1


# ---------------- distances from the field boundary ----------------

def test_analyse_measures_from_boundary_merges_and_filters():
    res = analyse(FIELD, synthetic_elements(), 2000)
    by_name = {r["name"]: r for r in res if r["name"]}
    kinds = [r["kind"] for r in res]
    assert "Water Park" not in by_name and "Far Eri" not in by_name
    assert kinds.count("drain") == 0  # the only drain is culverted

    tank = by_name["Periya Kanmai"]
    assert tank["kind"] == "tank" and tank["distance_m"] == pytest.approx(400, abs=2)
    assert tank["direction"] == "N" and tank["area_m2"] == pytest.approx(3600, rel=0.02)

    river = by_name["Vettar River"]
    assert river["distance_m"] == pytest.approx(1000, abs=3) and river["direction"] == "S"
    assert len(river["osm_ids"]) == 2 and river["seasonal"] is False  # merged; one segment is perennial
    assert river["length_in_radius_m"] == pytest.approx(1600, rel=0.02)

    well = next(r for r in res if r["kind"] == "well")
    assert well["distance_m"] == pytest.approx(30, abs=1) and well["direction"] == "W"
    pond = next(r for r in res if r["kind"] == "pond")
    assert pond["distance_m"] == pytest.approx(150, abs=1) and pond["direction"] == "E"

    assert [r["distance_m"] for r in res] == sorted(r["distance_m"] for r in res)
    assert res[0]["kind"] == "well"
    assert all(r["osm_url"].startswith("https://www.openstreetmap.org/") for r in res)


def test_water_body_touching_the_field_is_adjoining():
    els = [square_way(20, 90, 20, 30, {"natural": "water", "water": "pond"})]  # overlaps the east edge
    (pond,) = analyse(FIELD, els, 1000)
    assert pond["adjoining"] is True and pond["distance_m"] == 0 and pond["direction"] == "E"


def test_search_bbox_covers_radius():
    from shapely.geometry import shape

    s, w, n, e = search_bbox(shape(FIELD), 5000)
    lon_e, _, _ = GEOD.fwd(*at(100, 50), 90, 5000)
    assert n - s > 0.09 and e >= lon_e - 1e-4 and w < LON


# ---------------- Overpass adapter + caching ----------------

def _client() -> OverpassClient:
    return OverpassClient(client=ResilientClient("overpass", retries=2, backoff_base_s=0))


@respx.mock
def test_service_queries_overpass_and_caches():
    route = respx.get(get_settings().overpass_url).mock(
        return_value=httpx.Response(200, json={"elements": synthetic_elements()}))
    svc = WaterService(client=_client())
    first = svc.nearby("land-1", FIELD, 2000)
    assert route.call_count == 1
    query = route.calls.last.request.url.params["data"]
    assert "[out:json]" in query and "natural=water" in query and "man_made=water_well" in query
    assert first["provenance"]["license"] == "ODbL 1.0" and first["provenance"]["cache_status"] == "fresh"
    assert first["counts_by_kind"]["tank"] == 1 and first["nearest_by_kind"]["river"]["name"] == "Vettar River"

    second = svc.nearby("land-1", FIELD, 2000)
    assert route.call_count == 1 and second["provenance"]["cache_status"] == "cached"
    assert svc.cached("land-1", FIELD, 2000)["sources"] == first["sources"]


@respx.mock
def test_provider_failure_is_503_without_cache_and_stale_with_cache(fake_redis):
    respx.get(get_settings().overpass_url).mock(return_value=httpx.Response(504, text="busy"))
    with pytest.raises(AppError) as err:
        WaterService(client=_client()).nearby("land-2", FIELD, 2000)
    assert err.value.status_code == 503 and err.value.code == "water_sources_unavailable"

    # An expired-but-kept cache entry is served as stale rather than failing.
    key = WaterService.cache_key("land-3", FIELD, 2000)
    import json

    fake_redis.set(key, json.dumps({"radius_m": 2000, "sources": [], "counts_by_kind": {}, "nearest_by_kind": {},
                                    "provenance": {"retrieved_at": "2020-01-01T00:00:00+00:00"}}))
    stale = WaterService(client=_client()).nearby("land-3", FIELD, 2000)
    assert stale["provenance"]["cache_status"] == "stale"


def test_query_shape():
    q = build_query((10.7, 79.1, 10.8, 79.2))
    assert q.startswith("[out:json][timeout:25][bbox:10.7,79.1,10.8,79.2]") and q.endswith("out geom qt;")
