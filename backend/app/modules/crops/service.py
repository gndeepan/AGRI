import logging
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.errors import AppError, not_found
from app.core.http import ProviderError
from app.modules.crops.models import CropCatalog, CropVariety
from app.modules.crops.recommend import SiteContext, recommend, region_for_state
from app.modules.environment.models import SoilTest
from app.modules.environment.providers.soilgrids import DEPTH_WEIGHTS
from app.modules.environment.service import EnvironmentService
from app.modules.lands.models import LandProfile
from app.modules.users.models import User
from app.seed.crop_images import IMAGE_CREDITS
from app.seed.crops import SEASONS

log = logging.getLogger(__name__)


def variety_out(v: CropVariety) -> dict:
    d = v.data or {}
    lo_hi = d.get("duration_range") or [v.duration_days, v.duration_days]
    return {"id": v.id, "name": v.name, "duration_days": v.duration_days, "duration_range": lo_hi,
            "duration_group": v.duration_group, "seasons": v.seasons, "notes": v.notes, "reference": v.reference,
            "aliases": d.get("aliases") or [], "grain_type": d.get("grain_type"), "group": d.get("group"),
            "institute": d.get("institute"), "release_year": d.get("release_year"), "regions": d.get("regions") or [],
            "seasons_text": d.get("seasons_text"), "verified": v.verified, "source": v.source,
            "is_custom": v.owner_id is not None}


def crop_out(crop: CropCatalog, own_varieties: list[CropVariety] | None = None) -> dict:
    d = crop.data
    return {
        "slug": crop.slug, "name": {"en": crop.name_en, "ta": crop.name_ta},
        "scientific_name": crop.scientific_name, "category": crop.category, "image_url": crop.image_url,
        "image_credit": IMAGE_CREDITS.get(crop.slug),
        "seasons": [SEASONS[k] for k in d.get("seasons", []) if k in SEASONS],
        "duration_days": d["duration_days"], "water_requirement_mm": d["water_requirement_mm"],
        "temp_optimal_c": d["temp_optimal_c"], "ph_range": d["ph_range"],
        "suitable_textures": d["suitable_textures"], "methods": d["methods"], "description": d["description"],
        "references": d.get("references", []), "confidence": crop.confidence, "plannable": d.get("plannable", True),
        "stages": [{"key": s.key, "name": {"en": s.name_en, "ta": s.name_ta}, "order": s.order} for s in crop.stages],
        "varieties": [variety_out(v) for v in [*crop.varieties, *(own_varieties or [])]],
    }


def own_varieties(db: Session, user: User, crop_ids: list[uuid.UUID] | None = None) -> dict[uuid.UUID, list]:
    q = select(CropVariety).where(CropVariety.owner_id == user.id).order_by(CropVariety.name)
    if crop_ids is not None:
        q = q.where(CropVariety.crop_id.in_(crop_ids))
    out: dict[uuid.UUID, list] = {}
    for v in db.scalars(q):
        out.setdefault(v.crop_id, []).append(v)
    return out


def resolve_variety(db: Session, user: User, crop: CropCatalog, variety_id: uuid.UUID | None) -> CropVariety | None:
    """Variety selectable by this user for this crop: a catalog variety or one of their own."""
    if variety_id is None:
        return None
    v = db.get(CropVariety, variety_id)
    if v is None or v.crop_id != crop.id or (v.owner_id is not None and v.owner_id != user.id):
        raise AppError(422, "Variety does not belong to this crop", "invalid_variety")
    return v


def _crop_query():
    return select(CropCatalog).options(selectinload(CropCatalog.varieties), selectinload(CropCatalog.stages),
                                       selectinload(CropCatalog.rules))


def list_crops(db: Session) -> list[CropCatalog]:
    return list(db.scalars(_crop_query().order_by(CropCatalog.name_en)))


def get_crop(db: Session, slug: str) -> CropCatalog:
    crop = db.scalar(_crop_query().where(CropCatalog.slug == slug))
    if crop is None:
        raise not_found("Crop")
    return crop


def _scoring_dict(crop: CropCatalog) -> dict:
    return {
        "slug": crop.slug, "data": crop.data, "confidence": crop.confidence,
        "rules": [{"region": r.region, "season_key": r.season_key, "sowing_start": r.sowing_start,
                   "sowing_end": r.sowing_end} for r in crop.rules],
        "varieties": [{"name": v.name, "seasons": v.seasons, "verified": v.verified} for v in crop.varieties],
    }


def topsoil_average(layers: list[dict], key: str) -> float | None:
    """Depth-weighted 0–30 cm mean of a SoilGrids property, or None when no layer has it."""
    rows = [r for r in layers if r.get(key) is not None and r.get("depth") in DEPTH_WEIGHTS]
    if not rows:
        return None
    weight = sum(DEPTH_WEIGHTS[r["depth"]] for r in rows)
    return round(sum(r[key] * DEPTH_WEIGHTS[r["depth"]] for r in rows) / weight, 1)


def site_context(db: Session, land: LandProfile, sowing_date: date, irrigation: str,
                 env: EnvironmentService | None = None) -> SiteContext:
    env = env or EnvironmentService(db)
    ctx = SiteContext(sowing_date=sowing_date, irrigation=irrigation, region=region_for_state(land.state))
    test = db.scalar(select(SoilTest).where(SoilTest.land_id == land.id, SoilTest.deleted_at.is_(None))
                     .order_by(SoilTest.sample_date.desc()).limit(1))
    if test is not None and (test.ph is not None or test.texture):
        ctx.ph, ctx.texture, ctx.soil_source = test.ph, (test.texture or None), "soil_test"
        ctx.texture = ctx.texture.strip().lower() if ctx.texture else None
        ctx.soil_label = f"your soil test of {test.sample_date}"
        ctx.provenance["soil"] = {"provider": "farmer", "dataset": f"Soil test {test.sample_date}",
                                  "kind": "user_entered", "retrieved_at": test.created_at.isoformat(),
                                  "cache_status": "fresh", "notes": []}
    else:
        try:
            soil = env.soil_profile(land.centroid_lat, land.centroid_lon, land.id)
            layers = soil.get("layers", [])
            ctx.texture = soil.get("texture_class")
            ctx.ph = topsoil_average(layers, "ph")
            ctx.clay_pct = topsoil_average(layers, "clay_pct")
            ctx.sand_pct = topsoil_average(layers, "sand_pct")
            ctx.soil_source = "soilgrids"
            ctx.soil_label = "SoilGrids 250 m model, 0–30 cm"
            ctx.provenance["soil"] = soil["provenance"]
        except AppError as exc:
            log.info("soil unavailable for recommendations", extra={"error": exc.detail})
    try:
        ctx.climate, ctx.provenance["climate"] = env.climatology(land.centroid_lat, land.centroid_lon)
        ctx.climate_years = get_settings().climatology_years
    except ProviderError as exc:
        log.info("climatology unavailable for recommendations", extra={"error": str(exc)})
    return ctx


def recommendations(db: Session, land: LandProfile, sowing_date: date, irrigation: str,
                    env: EnvironmentService | None = None) -> list[dict]:
    crops = [c for c in list_crops(db) if c.data.get("plannable", True)]
    by_slug = {c.slug: c for c in crops}
    ctx = site_context(db, land, sowing_date, irrigation, env)
    results = recommend([_scoring_dict(c) for c in crops], ctx, SEASONS)
    return [{**{k: v for k, v in r.items() if k != "crop_slug"}, "crop": crop_out(by_slug[r["crop_slug"]])}
            for r in results]
