from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.deps import DB, AdminUser
from app.core.http import provider_health_snapshot
from app.modules.environment.models import DataSourceMetadata, ProviderHealth
from app.modules.lands.models import LandProfile
from app.modules.planning.models import CropCycle
from app.modules.users.models import User

router = APIRouter(prefix="/admin", tags=["admin"])
PROVIDERS = ["open-meteo-forecast", "open-meteo-archive", "open-meteo-elevation", "soilgrids", "nominatim"]


@router.get("/providers")
def providers(_: AdminUser, db: DB) -> list[dict]:
    stored = {p.provider: p for p in db.scalars(select(ProviderHealth))}
    meta = {m.key: m for m in db.scalars(select(DataSourceMetadata))}
    out = []
    for name in PROVIDERS:
        snap = provider_health_snapshot(name)
        if snap["calls"] == 0 and name in stored:  # Redis reset: fall back to last persisted snapshot
            p = stored[name]
            snap.update(calls=p.calls, errors=p.errors, p50_latency_ms=p.p50_latency_ms,
                        last_success_at=p.last_success_at, last_error_at=p.last_error_at, last_error=p.last_error,
                        error_rate=round(p.errors / p.calls, 3) if p.calls else None)
        m = meta.get(name)
        snap["source"] = {"name": m.name, "license": m.license, "rate_limit": m.rate_limit, "url": m.url} if m else None
        out.append(snap)
    return out


@router.get("/stats")
def stats(_: AdminUser, db: DB) -> dict:
    return {
        "users": db.scalar(select(func.count()).select_from(User).where(User.deleted_at.is_(None))),
        "lands": db.scalar(select(func.count()).select_from(LandProfile).where(LandProfile.deleted_at.is_(None))),
        "cycles": db.scalar(select(func.count()).select_from(CropCycle).where(CropCycle.deleted_at.is_(None))),
        "active_cycles": db.scalar(select(func.count()).select_from(CropCycle).where(
            CropCycle.deleted_at.is_(None), CropCycle.status == "active")),
    }
