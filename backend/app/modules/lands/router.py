import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.audit import audit
from app.core.deps import DB, CurrentUser
from app.core.errors import AppError
from app.core.http import ProviderError
from app.core.ratelimit import RateLimit
from app.modules.lands import service
from app.modules.lands.geocoding import NominatimGeocoder
from app.modules.lands.models import LandProfile
from app.modules.lands.schemas import (
    BoundaryIn,
    GeoSearchResult,
    LandCreate,
    LandDetail,
    LandMetricsOut,
    LandPatch,
    LandSummary,
    ReverseResult,
)

geo_router = APIRouter(prefix="/geo", tags=["geo"])
router = APIRouter(prefix="/lands", tags=["lands"])
geo_limit = Depends(RateLimit("geo", limit=30, window_s=60))


@geo_router.post("/measure", response_model=LandMetricsOut)
def measure(body: BoundaryIn, _: CurrentUser) -> dict:
    return service.measure(body.boundary)


@geo_router.get("/search", response_model=list[GeoSearchResult], dependencies=[geo_limit])
def search(_: CurrentUser, q: str = Query(min_length=2, max_length=200)) -> list[dict]:
    try:
        return NominatimGeocoder().search(q)
    except ProviderError as exc:
        raise AppError(503, "Location search is temporarily unavailable", "provider_unavailable") from exc


@geo_router.get("/reverse", response_model=ReverseResult, dependencies=[geo_limit])
def reverse(_: CurrentUser, lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180)) -> dict:
    try:
        return NominatimGeocoder().reverse(lat, lon)
    except ProviderError as exc:
        raise AppError(503, "Location lookup is temporarily unavailable", "provider_unavailable") from exc


@router.get("", response_model=list[LandSummary])
def list_lands(user: CurrentUser, db: DB) -> list[dict]:
    lands = db.scalars(
        select(LandProfile).options(selectinload(LandProfile.boundaries))
        .where(LandProfile.owner_id == user.id, LandProfile.deleted_at.is_(None))
        .order_by(LandProfile.created_at)
    ).all()
    return [service.land_payload(land, service.active_cycle_ref(db, land.id)) for land in lands]


@router.post("", response_model=LandDetail, status_code=201)
def create_land(body: LandCreate, request: Request, user: CurrentUser, db: DB) -> dict:
    land = service.create_land(db, user, body.name, body.boundary, body.notes)
    audit(db, "land.create", user_id=user.id, request=request, entity_type="land", entity_id=land.id)
    db.commit()
    db.refresh(land)
    return service.land_payload(land, None, detail=True)


@router.get("/{land_id}", response_model=LandDetail)
def get_land(land_id: uuid.UUID, user: CurrentUser, db: DB) -> dict:
    land = service.get_owned_land(db, user, land_id)
    return service.land_payload(land, service.active_cycle_ref(db, land.id), detail=True)


@router.patch("/{land_id}", response_model=LandDetail)
def patch_land(land_id: uuid.UUID, body: LandPatch, request: Request, user: CurrentUser, db: DB) -> dict:
    land = service.get_owned_land(db, user, land_id)
    service.update_land(db, land, body.name, body.boundary, body.notes, "notes" in body.model_fields_set)
    audit(db, "land.update", user_id=user.id, request=request, entity_type="land", entity_id=land.id,
          boundary_changed=body.boundary is not None)
    db.commit()
    db.refresh(land)
    return service.land_payload(land, service.active_cycle_ref(db, land.id), detail=True)


@router.delete("/{land_id}", status_code=204)
def delete_land(land_id: uuid.UUID, request: Request, user: CurrentUser, db: DB) -> Response:
    land = service.get_owned_land(db, user, land_id)
    land.deleted_at = datetime.now(UTC)
    audit(db, "land.delete", user_id=user.id, request=request, entity_type="land", entity_id=land.id)
    db.commit()
    return Response(status_code=204)
