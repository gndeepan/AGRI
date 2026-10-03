import uuid

from fastapi import APIRouter, Depends, Query

from app.core.deps import DB, CurrentUser
from app.core.ratelimit import RateLimit
from app.modules.lands.service import current_boundary, get_owned_land
from app.modules.water.service import DEFAULT_RADIUS_M, MAX_RADIUS_M, WaterService

router = APIRouter(prefix="/lands/{land_id}", tags=["water"])


@router.get("/water-sources", dependencies=[Depends(RateLimit("water", 20, 60))])
def water_sources(land_id: uuid.UUID, user: CurrentUser, db: DB,
                  radius_m: int = Query(DEFAULT_RADIUS_M, ge=500, le=MAX_RADIUS_M)) -> dict:
    land = get_owned_land(db, user, land_id)
    boundary = current_boundary(land).metrics["geojson"]
    return WaterService().nearby(land.id, boundary, radius_m)
