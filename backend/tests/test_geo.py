import pytest
from shapely.geometry import Point

from app.modules.lands.geo import GeometryError, compute_metrics, parse_polygon, validate_and_measure
from tests.conftest import square

THANJAVUR = (79.138, 10.787)  # lon, lat — synthetic field location


def test_one_hectare_square_near_thanjavur():
    poly, m = validate_and_measure(square(*THANJAVUR, 100))
    assert m.area_m2 == pytest.approx(10_000, rel=1e-3)
    assert m.area_ha == pytest.approx(1.0, rel=1e-3)
    assert m.area_acres == pytest.approx(2.4711, rel=1e-3)
    assert m.perimeter_m == pytest.approx(400, rel=1e-3)
    assert m.vertex_count == 4
    assert poly.contains(Point(m.centroid["lon"], m.centroid["lat"]))
    assert poly.contains(Point(m.representative_point["lon"], m.representative_point["lat"]))
    minx, miny, maxx, maxy = m.bbox
    assert minx == pytest.approx(THANJAVUR[0]) and miny == pytest.approx(THANJAVUR[1])


def test_degree_square_at_equator_matches_known_geodesic_area():
    # 0.001° × 0.001° at the equator ≈ 111.319 m × 110.574 m on WGS84.
    geo = {"type": "Polygon", "coordinates": [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]]}
    _, m = validate_and_measure(geo)
    assert m.area_m2 == pytest.approx(111.3195 * 110.5743, rel=2e-3)


def test_orientation_does_not_change_area():
    ccw = square(*THANJAVUR, 80)
    cw = {"type": "Polygon", "coordinates": [list(reversed(ccw["coordinates"][0]))]}
    assert validate_and_measure(ccw)[1].area_m2 == pytest.approx(validate_and_measure(cw)[1].area_m2)


def test_unclosed_ring_and_duplicate_points_are_normalised():
    ring = square(*THANJAVUR, 50)["coordinates"][0][:-1]
    ring.insert(1, ring[0])  # consecutive duplicate
    _, m = validate_and_measure({"type": "Polygon", "coordinates": [ring]})
    assert m.vertex_count == 4
    assert m.area_m2 == pytest.approx(2500, rel=1e-3)


def test_hole_reduces_area():
    outer = square(*THANJAVUR, 100)["coordinates"][0]
    hole = square(THANJAVUR[0] + 0.0002, THANJAVUR[1] + 0.0002, 20)["coordinates"][0]
    _, m = validate_and_measure({"type": "Polygon", "coordinates": [outer, hole]})
    assert m.area_m2 == pytest.approx(10_000 - 400, rel=2e-3)


@pytest.mark.parametrize(("geo", "code"), [
    ({"type": "Point", "coordinates": [79, 10]}, "not_polygon"),
    ("not-json-object", "not_polygon"),
    ({"type": "Polygon", "coordinates": []}, "invalid_geometry"),
    ({"type": "Polygon", "coordinates": [[[79, 10], [79.001, 10], [79, 10]]]}, "too_few_vertices"),
    ({"type": "Polygon", "coordinates": [[[79, 10], [79.001, 10.001], [79.001, 10], [79, 10.001], [79, 10]]]},
     "invalid_geometry"),  # bow-tie self-intersection
    ({"type": "Polygon", "coordinates": [[[190, 10], [191, 10], [191, 11], [190, 10]]]}, "out_of_range"),
    ({"type": "Polygon", "coordinates": [[[79, 10], ["a", 10], [79, 11], [79, 10]]]}, "invalid_geometry"),
])
def test_invalid_geometries(geo, code):
    with pytest.raises(GeometryError) as exc:
        validate_and_measure(geo)
    assert exc.value.code == code


def test_size_limits():
    with pytest.raises(GeometryError) as small:
        compute_metrics(parse_polygon(square(*THANJAVUR, 2)))
    assert small.value.code == "too_small"
    with pytest.raises(GeometryError) as large:
        compute_metrics(parse_polygon(square(*THANJAVUR, 4000)))
    assert large.value.code == "too_large"
