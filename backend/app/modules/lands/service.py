import logging
import uuid
from datetime import date

from geoalchemy2.shape import from_shape, to_shape
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, not_found
from app.core.http import ProviderError
from app.modules.lands.geo import BOUNDARY_DISCLAIMER, GeometryError, polygon_to_geojson, validate_and_measure
from app.modules.lands.geocoding import NominatimGeocoder
from app.modules.lands.models import LandBoundary, LandProfile
from app.modules.users.models import User

log = logging.getLogger(__name__)


def geometry_http_error(exc: GeometryError) -> AppError:
    return AppError(422, str(exc), exc.code)


def measure(geojson: dict) -> dict:
    try:
        _, metrics = validate_and_measure(geojson)
    except GeometryError as exc:
        raise geometry_http_error(exc) from exc
    return metrics.as_dict()


def get_owned_land(db: Session, user: User, land_id: uuid.UUID) -> LandProfile:
    land = db.scalar(
        select(LandProfile).options(selectinload(LandProfile.boundaries))
        .where(LandProfile.id == land_id, LandProfile.owner_id == user.id, LandProfile.deleted_at.is_(None))
    )
    if land is None:
        raise not_found("Land")
    return land


def current_boundary(land: LandProfile) -> LandBoundary:
    return next(b for b in reversed(land.boundaries) if b.is_current)


def _add_boundary(db: Session, land: LandProfile, geojson: dict) -> LandBoundary:
    try:
        poly, metrics = validate_and_measure(geojson)
    except GeometryError as exc:
        raise geometry_http_error(exc) from exc
    version = 1
    for b in land.boundaries:
        b.is_current = False
        version = max(version, b.version + 1)
    boundary = LandBoundary(
        version=version, is_current=True, geom=from_shape(poly, srid=4326), area_m2=metrics.area_m2,
        perimeter_m=metrics.perimeter_m, metrics={**metrics.as_dict(), "geojson": polygon_to_geojson(poly)},
    )
    land.boundaries.append(boundary)
    land.centroid_lat = metrics.centroid["lat"]
    land.centroid_lon = metrics.centroid["lon"]
    land.terrain = None  # recomputed lazily for the new shape
    db.flush()
    # Cross-check geodesic area against PostGIS geography area.
    pg_area = db.scalar(select(func.ST_Area(func.Geography(LandBoundary.geom))).where(LandBoundary.id == boundary.id))
    if pg_area and abs(pg_area - metrics.area_m2) / metrics.area_m2 > 0.005:
        log.warning("area mismatch between pyproj and PostGIS",
                    extra={"land_id": str(land.id), "pyproj": metrics.area_m2, "postgis": pg_area})
    return boundary


def _locate(land: LandProfile) -> None:
    try:
        place = NominatimGeocoder().reverse(land.centroid_lat, land.centroid_lon)
    except ProviderError as exc:
        log.info("reverse geocode skipped", extra={"error": str(exc)})
        return
    land.village, land.district, land.state = place.get("village"), place.get("district"), place.get("state")


def create_land(db: Session, user: User, name: str, geojson: dict, notes: str | None,
                reverse_geocode: bool = True) -> LandProfile:
    land = LandProfile(owner_id=user.id, name=name.strip(), notes=notes, centroid_lat=0, centroid_lon=0)
    db.add(land)
    _add_boundary(db, land, geojson)
    if reverse_geocode:
        _locate(land)
    return land


def update_land(db: Session, land: LandProfile, name: str | None, geojson: dict | None, notes: str | None,
                notes_set: bool, reverse_geocode: bool = True) -> LandProfile:
    if name is not None:
        land.name = name.strip()
    if notes_set:
        land.notes = notes
    if geojson is not None:
        _add_boundary(db, land, geojson)
        if reverse_geocode:
            _locate(land)
    return land


def land_payload(land: LandProfile, active_cycle: dict | None, detail: bool = False) -> dict:
    b = current_boundary(land)
    metrics = {k: v for k, v in b.metrics.items() if k != "geojson"}
    geojson = b.metrics.get("geojson") or polygon_to_geojson(to_shape(b.geom))
    out = {
        "id": land.id, "name": land.name, "metrics": metrics, "boundary": geojson,
        "active_cycle": active_cycle, "updated_at": land.updated_at,
    }
    if detail:
        out.update({
            "notes": land.notes, "village": land.village, "district": land.district, "state": land.state,
            "terrain": land.terrain, "boundary_disclaimer": BOUNDARY_DISCLAIMER, "created_at": land.created_at,
        })
    return out


def active_cycle_ref(db: Session, land_id: uuid.UUID, today: date | None = None) -> dict | None:
    from app.modules.planning.service import active_cycle_summary  # avoid import cycle

    return active_cycle_summary(db, land_id, today or date.today())
