from datetime import date, timedelta

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser
from app.core.errors import AppError
from app.modules.environment.service import EnvironmentService
from app.modules.lands.models import LandProfile
from app.modules.lands.service import active_cycle_ref, land_payload
from app.modules.planning import service as planning
from app.modules.planning.models import AgriculturalTask, CropCycle
from app.modules.users.schemas import user_out

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def dashboard(user: CurrentUser, db: DB) -> dict:
    today = date.today()
    lands = list(db.scalars(select(LandProfile).options(selectinload(LandProfile.boundaries))
                            .where(LandProfile.owner_id == user.id, LandProfile.deleted_at.is_(None))
                            .order_by(LandProfile.created_at)))
    fields = [land_payload(land, active_cycle_ref(db, land.id, today)) for land in lands]
    cycles = list(db.scalars(select(CropCycle).options(selectinload(CropCycle.predictions)).where(
        CropCycle.owner_id == user.id, CropCycle.deleted_at.is_(None),
        CropCycle.status.in_(planning.ACTIVE_STATUSES)).order_by(CropCycle.anchor_date)))
    tasks = list(db.scalars(select(AgriculturalTask).where(
        AgriculturalTask.owner_id == user.id, AgriculturalTask.deleted_at.is_(None),
        AgriculturalTask.status == "pending", AgriculturalTask.cycle_id.in_([c.id for c in cycles]),
        AgriculturalTask.due_date <= today + timedelta(days=14),
        AgriculturalTask.due_date >= today - timedelta(days=7)).order_by(AgriculturalTask.due_date).limit(20))
    ) if cycles else []

    env = EnvironmentService(db)
    alerts: list[dict] = []
    weather_today = None
    land_ids_with_cycles = {c.land_id for c in cycles}
    primary = next((land for land in lands if land.id in land_ids_with_cycles), lands[0] if lands else None)
    for land in lands:
        if land.id not in land_ids_with_cycles and land is not primary:
            continue
        try:
            bundle = env.weather_bundle(land.centroid_lat, land.centroid_lon, land.id)
        except AppError:
            continue
        alerts += [{**a, "land_id": str(land.id), "land_name": land.name} for a in bundle["alerts"]]
        if land is primary:
            upcoming = [d for d in bundle["daily"] if d["date"] >= today.isoformat()][:7]
            weather_today = {"land_id": land.id, "current": bundle["current"], "daily": upcoming,
                             "provenance": bundle["provenance"]}

    total_m2 = sum(f["metrics"]["area_m2"] for f in fields)
    return {
        "user": user_out(user),
        "totals": {"area_ha": round(total_m2 / 10_000, 3), "area_acres": round(total_m2 / 4046.8564224, 3),
                   "fields": len(fields), "active_cycles": len(cycles)},
        "fields": fields,
        "active_cycles": [planning.cycle_out(db, c, today) for c in cycles],
        "upcoming_tasks": [planning.task_out(t) for t in tasks],
        "alerts": alerts,
        "weather_today": weather_today,
    }
