import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.audit import audit
from app.core.deps import DB, CurrentUser
from app.core.errors import AppError, not_found
from app.core.ratelimit import RateLimit
from app.modules.crops import service, variety_ai
from app.modules.crops.models import CropVariety
from app.modules.crops.schemas import VarietyCreate, VarietySuggestIn
from app.modules.lands.service import get_owned_land
from app.modules.planning.models import CropCycle

router = APIRouter(tags=["crops"])


@router.get("/crops")
def list_crops(user: CurrentUser, db: DB) -> list[dict]:
    own = service.own_varieties(db, user)
    return [service.crop_out(c, own.get(c.id)) for c in service.list_crops(db)]


@router.get("/crops/{slug}")
def get_crop(slug: str, user: CurrentUser, db: DB) -> dict:
    crop = service.get_crop(db, slug)
    return service.crop_out(crop, service.own_varieties(db, user, [crop.id]).get(crop.id))


@router.post("/crops/{slug}/varieties/suggest",
             dependencies=[Depends(RateLimit("variety_suggest", limit=12, window_s=60))])
def suggest_variety(slug: str, body: VarietySuggestIn, user: CurrentUser, db: DB) -> dict:
    crop = service.get_crop(db, slug)
    candidates = [*crop.varieties, *service.own_varieties(db, user, [crop.id]).get(crop.id, [])]
    matches = variety_ai.catalog_matches(body.name, candidates)
    out = {"query": body.name, "matches": [{**service.variety_out(v), "match_score": round(score, 2)}
                                           for v, score in matches], "suggestion": None}
    if matches and matches[0][1] >= 0.9 and not body.force_ai:
        return out
    out["suggestion"] = variety_ai.ai_suggestion(crop, body.name, body.region, variety_ai.get_variety_llm())
    return out


@router.post("/crops/{slug}/varieties", status_code=201)
def create_variety(slug: str, body: VarietyCreate, request: Request, user: CurrentUser, db: DB) -> dict:
    crop = service.get_crop(db, slug)
    lo, hi = body.duration_days_range
    mid = round((lo + hi) / 2)
    row = CropVariety(
        crop_id=crop.id, owner_id=user.id, name=body.name, duration_days=mid,
        duration_group=variety_ai.duration_group(mid), seasons=body.seasons, notes=body.notes, reference=None,
        source=body.source, verified=False,
        data={"aliases": body.aliases, "grain_type": body.grain_type, "group": "custom", "regions": body.regions,
              "duration_range": [lo, hi], "ai_model": body.ai_model, "ai_confidence": body.ai_confidence},
    )
    db.add(row)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "You already saved a variety with this name.", "variety_exists") from exc
    audit(db, "variety.create", user_id=user.id, request=request, entity_type="crop_variety", entity_id=row.id,
          crop=crop.slug, source=body.source)
    db.commit()
    return service.variety_out(row)


@router.delete("/crops/varieties/{variety_id}", status_code=204)
def delete_variety(variety_id: uuid.UUID, request: Request, user: CurrentUser, db: DB) -> Response:
    row = db.get(CropVariety, variety_id)
    if row is None or row.owner_id != user.id:
        raise not_found("Variety")
    if db.scalar(select(CropCycle.id).where(CropCycle.variety_id == row.id).limit(1)):
        raise AppError(409, "This variety is used by a crop plan.", "variety_in_use")
    db.delete(row)
    audit(db, "variety.delete", user_id=user.id, request=request, entity_type="crop_variety", entity_id=variety_id)
    db.commit()
    return Response(status_code=204)


@router.get("/lands/{land_id}/recommendations")
def recommendations(land_id: uuid.UUID, user: CurrentUser, db: DB, sowing_date: date | None = Query(None),
                    irrigation: Literal["assured", "limited", "rainfed"] = Query("limited")) -> list[dict]:
    land = get_owned_land(db, user, land_id)
    return service.recommendations(db, land, sowing_date or date.today(), irrigation)
