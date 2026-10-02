import logging
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, not_found
from app.modules.crops.models import CropCatalog, CropVariety
from app.modules.crops.service import crop_out, get_crop, resolve_variety, variety_out
from app.modules.environment.alerts import forecast_alerts
from app.modules.environment.models import SoilTest
from app.modules.environment.service import EnvironmentService
from app.modules.lands.models import LandProfile
from app.modules.planning import engine
from app.modules.planning.models import AgriculturalTask, CropCycle, CropStagePrediction, FieldObservation
from app.modules.planning.templates import generic_tasks, rice_tasks
from app.modules.users.models import User
from app.seed.crops import GENERIC_FRACTIONS, IRRI_GROWTH

log = logging.getLogger(__name__)
BASE_TEMPS = {"cotton": 15.5}
ACTIVE_STATUSES = ("planned", "active")
UNVERIFIED_MARGIN_DAYS = 5  # extra ± days on stage dates when the variety duration is unverified
TIMELINE_WEATHER_FIELDS = (
    "tmin_c", "tmax_c", "precipitation_mm", "precipitation_hours", "wind_speed_max_kmh",
    "wind_direction_dominant_deg", "humidity_mean_pct", "cloud_cover_mean_pct", "sunrise", "sunset", "kind",
)


def duration_group(days: int) -> str:
    return "short" if days <= 115 else "medium" if days <= 135 else "long"


def stage_setup(crop: CropCatalog, variety: CropVariety | None, method: str, anchor: date,
                nursery_sowing_date: date | None) -> tuple[list[engine.StageDef], date, dict]:
    duration = variety.duration_days if variety else round(sum(crop.data["duration_days"]) / 2)
    if crop.model_key == "rice_phenology":
        transplanted = method == "transplanting"
        group = variety.duration_group if variety else duration_group(duration)
        nursery_days = 0
        if transplanted:
            nursery_days = ((anchor - nursery_sowing_date).days if nursery_sowing_date
                            else engine.DEFAULT_NURSERY_DAYS[group])
            nursery_days = min(max(nursery_days, 10), 45)
        defs = engine.rice_stage_defs(duration, transplanted, nursery_days)
        start = anchor - timedelta(days=nursery_days)
        return defs, start, {"model": engine.RICE_MODEL, "base_c": 10.0, "duration": duration,
                             "nursery_days": nursery_days}
    fractions = [tuple(f) for f in crop.data.get("fractions", GENERIC_FRACTIONS)]
    defs = engine.fraction_stage_defs(duration, fractions)  # type: ignore[arg-type]
    return defs, anchor, {"model": engine.FRACTION_MODEL, "base_c": BASE_TEMPS.get(crop.slug, 10.0),
                          "duration": duration, "nursery_days": 0}


def _weather_lookup(env: EnvironmentService, land: LandProfile, start: date, days: int):
    rows, provenances = env.daily_series(land.centroid_lat, land.centroid_lon, start,
                                         start + timedelta(days=days), land.id)
    by_date = {start + timedelta(days=i): row for i, row in enumerate(rows)}
    return by_date.get, provenances


def compute(db: Session, cycle: CropCycle, env: EnvironmentService | None = None) -> engine.Prediction:
    env = env or EnvironmentService(db)
    crop = db.get(CropCatalog, cycle.crop_id)
    variety = db.get(CropVariety, cycle.variety_id) if cycle.variety_id else None
    land = db.get(LandProfile, cycle.land_id)
    assert crop is not None and land is not None
    defs, start, meta = stage_setup(crop, variety, cycle.method, cycle.anchor_date, cycle.nursery_sowing_date)
    lookup, provenances = _weather_lookup(env, land, start, meta["duration"] + 90)
    observed: dict[str, date] = {}
    for obs in db.scalars(select(FieldObservation).where(
            FieldObservation.cycle_id == cycle.id, FieldObservation.deleted_at.is_(None),
            FieldObservation.stage_key.is_not(None)).order_by(FieldObservation.observed_on)):
        observed.setdefault(obs.stage_key, obs.observed_on)
    pred = engine.predict(defs, start, lookup, observed_starts=observed, variety_known=variety is not None,
                          extra_margin_days=0 if variety is None or variety.verified else UNVERIFIED_MARGIN_DAYS,
                          base_c=meta["base_c"], model=meta["model"])

    missing = list(pred.missing_inputs)
    if variety is not None and not variety.verified:
        rng = (variety.data or {}).get("duration_range") or [variety.duration_days] * 2
        origin = {"ai_suggested": "AI-suggested", "user": "entered by you"}.get(variety.source,
                                                                               "approximate in the catalog")
        missing.append(f"Variety duration {rng[0]}–{rng[1]} days is {origin} and not verified; the model uses "
                       f"{variety.duration_days} days and widens the date ranges by "
                       f"±{UNVERIFIED_MARGIN_DAYS} days.")
    has_test = db.scalar(select(SoilTest.id).where(SoilTest.land_id == land.id, SoilTest.deleted_at.is_(None)).limit(1))
    if not has_test:
        missing.append("No soil test entered — nutrient reminders cannot be tailored.")
    if crop.model_key == "rice_phenology" and cycle.method == "transplanting" and not cycle.nursery_sowing_date:
        missing.append(f"Nursery sowing date not given — assumed {meta['nursery_days']}-day-old seedlings.")
    if observed:
        pred.assumptions.append("Farmer-observed stage dates override the model: " +
                                ", ".join(f"{k} on {v}" for k, v in observed.items()) + ".")

    cycle.predictions.clear()
    db.flush()
    for s in pred.stages:
        sw, ew = s.window("start"), s.window("end")
        cycle.predictions.append(CropStagePrediction(
            stage_key=s.key, order=s.order, start_earliest=sw["earliest"], start_expected=sw["expected"],
            start_latest=sw["latest"], end_earliest=ew["earliest"], end_expected=ew["expected"],
            end_latest=ew["latest"], gdd_start=s.gdd_start, gdd_end=s.gdd_end, source=s.source,
            observed_on=s.observed_on,
        ))
    hw = pred.harvest_window()
    cycle.harvest_earliest, cycle.harvest_expected, cycle.harvest_latest = hw["earliest"], hw["expected"], hw["latest"]
    cycle.model_name, cycle.model_version = pred.model_name, pred.model_version
    refs = [IRRI_GROWTH] if crop.model_key == "rice_phenology" else []
    cycle.model_meta = {
        "base_temp_c": pred.base_temp_c, "assumptions": pred.assumptions, "missing_inputs": missing,
        "references": refs + crop.data.get("references", [])[:2], "weather_provenance": provenances,
        "start_date": start.isoformat(), "duration_days": meta["duration"],
    }
    cycle.computed_at = datetime.now(UTC)
    _regenerate_tasks(db, cycle, crop, pred)
    return pred


def _regenerate_tasks(db: Session, cycle: CropCycle, crop: CropCatalog, pred: engine.Prediction) -> None:
    existing = list(db.scalars(select(AgriculturalTask).where(
        AgriculturalTask.cycle_id == cycle.id, AgriculturalTask.deleted_at.is_(None),
        AgriculturalTask.source == "plan_template")))
    finished = {t.template_key for t in existing if t.status != "pending"}
    for t in existing:
        if t.status == "pending":
            db.delete(t)
    templates = (rice_tasks(pred, cycle.anchor_date, cycle.method, cycle.water_availability)
                 if crop.model_key == "rice_phenology" else generic_tasks(pred, cycle.anchor_date, cycle.water_availability))
    for tpl in templates:
        if tpl["template_key"] not in finished:
            db.add(AgriculturalTask(cycle_id=cycle.id, owner_id=cycle.owner_id, **tpl))


def get_owned_cycle(db: Session, user: User, cycle_id: uuid.UUID) -> CropCycle:
    cycle = db.scalar(select(CropCycle).options(selectinload(CropCycle.predictions)).where(
        CropCycle.id == cycle_id, CropCycle.owner_id == user.id, CropCycle.deleted_at.is_(None)))
    if cycle is None:
        raise not_found("Crop cycle")
    return cycle


def create_cycle(db: Session, user: User, body, env: EnvironmentService | None = None) -> CropCycle:
    from app.modules.lands.service import get_owned_land

    land = get_owned_land(db, user, body.land_id)
    crop = get_crop(db, body.crop_slug)
    if not crop.data.get("plannable", True):
        raise AppError(422, f"{crop.name_en} is a perennial crop; stage-by-stage planning is not available yet",
                       "crop_not_plannable")
    resolve_variety(db, user, crop, body.variety_id)
    if body.method not in crop.data["methods"]:
        raise AppError(422, f"{crop.name_en} does not support method '{body.method}'", "invalid_method")
    cycle = CropCycle(
        owner_id=user.id, land_id=land.id, crop_id=crop.id, variety_id=body.variety_id,
        status="planned", method=body.method, anchor_date=body.anchor_date, anchor_type=body.anchor_type,
        nursery_sowing_date=body.nursery_sowing_date, irrigation_method=body.irrigation_method,
        water_availability=body.water_availability, planting_density=body.planting_density, notes=body.notes,
    )
    db.add(cycle)
    db.flush()
    compute(db, cycle, env)
    refresh_status(cycle, date.today())
    return cycle


def refresh_status(cycle: CropCycle, today: date) -> None:
    start = date.fromisoformat(cycle.model_meta.get("start_date", cycle.anchor_date.isoformat()))
    if cycle.status == "planned" and today >= start:
        cycle.status = "active"


def _stage_results(cycle: CropCycle) -> list[engine.StageResult]:
    return [engine.StageResult(
        key=p.stage_key, order=p.order, start=p.start_expected, end=p.end_expected,
        start_margin=(p.start_latest - p.start_expected).days, end_margin=(p.end_latest - p.end_expected).days,
        gdd_start=p.gdd_start, gdd_end=p.gdd_end, source=p.source, observed_on=p.observed_on,
    ) for p in sorted(cycle.predictions, key=lambda p: p.order)]


def stored_prediction(cycle: CropCycle) -> engine.Prediction:
    return engine.Prediction(cycle.model_name or "", cycle.model_version or "",
                             cycle.model_meta.get("base_temp_c", 10.0), _stage_results(cycle))


def stage_names(crop: CropCatalog) -> dict[str, dict[str, str]]:
    return {s.key: {"en": s.name_en, "ta": s.name_ta} for s in crop.stages}


def current_state(pred: engine.Prediction, today: date) -> dict | None:
    if not pred.stages:
        return None
    stage, _ = engine.stage_on(pred, today)
    return {"date": today, "das": (today - pred.start).days, "stage_key": stage.key,
            "stage_progress": round(engine.cycle_progress(pred, today), 4)}


def cycle_out(db: Session, cycle: CropCycle, today: date | None = None) -> dict:
    today = today or date.today()
    crop = get_crop_by_id(db, cycle.crop_id)
    variety = db.get(CropVariety, cycle.variety_id) if cycle.variety_id else None
    land = db.get(LandProfile, cycle.land_id)
    names = stage_names(crop)
    pred = stored_prediction(cycle)
    stages = []
    for s in pred.stages:
        stages.append({
            "key": s.key, "name": names.get(s.key, {"en": s.key, "ta": s.key}), "order": s.order,
            "start": s.window("start"), "end": s.window("end"), "gdd_start": s.gdd_start, "gdd_end": s.gdd_end,
            "source": s.source, "observed_on": s.observed_on,
        })
    meta = cycle.model_meta or {}
    return {
        "id": cycle.id, "land_id": cycle.land_id, "land_name": land.name if land else "", "crop": crop_out(crop),
        "variety": variety_out(variety) if variety else None, "status": cycle.status, "method": cycle.method,
        "anchor_date": cycle.anchor_date, "anchor_type": cycle.anchor_type,
        "nursery_sowing_date": cycle.nursery_sowing_date, "irrigation_method": cycle.irrigation_method,
        "water_availability": cycle.water_availability, "planting_density": cycle.planting_density,
        "notes": cycle.notes, "stages": stages,
        "harvest_window": {"earliest": cycle.harvest_earliest, "expected": cycle.harvest_expected,
                           "latest": cycle.harvest_latest},
        "current": current_state(pred, today) if cycle.status in ACTIVE_STATUSES else None,
        "model": {"name": cycle.model_name, "version": cycle.model_version,
                  "base_temp_c": meta.get("base_temp_c"), "assumptions": meta.get("assumptions", []),
                  "missing_inputs": meta.get("missing_inputs", []), "references": meta.get("references", [])},
        "created_at": cycle.created_at, "updated_at": cycle.updated_at,
    }


def get_crop_by_id(db: Session, crop_id: uuid.UUID) -> CropCatalog:
    crop = db.scalar(select(CropCatalog).options(selectinload(CropCatalog.stages),
                                                 selectinload(CropCatalog.varieties))
                     .where(CropCatalog.id == crop_id))
    assert crop is not None
    return crop


def active_cycle_summary(db: Session, land_id: uuid.UUID, today: date) -> dict | None:
    cycle = db.scalar(select(CropCycle).options(selectinload(CropCycle.predictions)).where(
        CropCycle.land_id == land_id, CropCycle.deleted_at.is_(None), CropCycle.status.in_(ACTIVE_STATUSES))
        .order_by(CropCycle.anchor_date.desc()).limit(1))
    if cycle is None:
        return None
    crop = get_crop_by_id(db, cycle.crop_id)
    pred = stored_prediction(cycle)
    key = name = None
    if pred.stages:
        stage, _ = engine.stage_on(pred, today)
        key, name = stage.key, stage_names(crop).get(stage.key, {}).get("en", stage.key)
    return {"id": cycle.id, "crop_name": crop.name_en, "stage_key": key, "stage_name": name}


STAGE_WARNINGS = {
    # (stage, condition) → message. Only evaluated on observed/forecast days.
    "flowering_heat": ("flowering", "Heat during flowering", "Temperatures above ~35 °C at anthesis can cause "
                       "spikelet sterility. Keep standing water; avoid any field operations at midday."),
    "flowering_rain": ("flowering", "Heavy rain during flowering", "Heavy rain can disrupt pollination. "
                       "Postpone any spraying."),
    "lodging": ("grain_filling", "Strong wind during grain filling", "Gusty winds can cause lodging of heavy "
                "panicles. Check bunds and drainage."),
}


def stage_warnings(stage_key: str, row: dict | None, d: date) -> list[dict]:
    if not row or row.get("kind") != "forecast":
        return []
    out = []
    tmax, rain, gust = row.get("tmax_c"), row.get("precipitation_mm") or 0, row.get("wind_gusts_max_kmh") or 0
    checks = {
        "flowering_heat": stage_key == "flowering" and tmax is not None and tmax >= 35,
        "flowering_rain": stage_key == "flowering" and rain >= 64.5,
        "lodging": stage_key in ("grain_filling", "maturity") and gust >= 50,
    }
    for key, hit in checks.items():
        if hit:
            _, title, msg = STAGE_WARNINGS[key]
            out.append({"id": f"stage-{key}-{d}", "severity": "watch", "title": title,
                        "message": msg + " (Rule-based Bhoomi alert from forecast data.)", "starts": d.isoformat(),
                        "ends": None, "source": "bhoomi_rules", "kind": "forecast"})
    return out


def timeline(db: Session, cycle: CropCycle, start: date | None, end: date | None,
             env: EnvironmentService | None = None) -> list[dict]:
    env = env or EnvironmentService(db)
    pred = stored_prediction(cycle)
    if not pred.stages:
        return []
    start = start or pred.start - timedelta(days=7)
    end = end or (cycle.harvest_latest or pred.harvest.end) + timedelta(days=7)
    if end < start or (end - start).days > 450:
        raise AppError(422, "Timeline range must be positive and at most 450 days", "invalid_range")
    land = db.get(LandProfile, cycle.land_id)
    assert land is not None
    rows, _ = env.daily_series(land.centroid_lat, land.centroid_lon, start, end, land.id)
    tasks = list(db.scalars(select(AgriculturalTask).where(
        AgriculturalTask.cycle_id == cycle.id, AgriculturalTask.deleted_at.is_(None),
        AgriculturalTask.due_date >= start, AgriculturalTask.due_date <= end)))
    tasks_by_day: dict[date, list[dict]] = {}
    for t in tasks:
        tasks_by_day.setdefault(t.due_date, []).append(task_out(t))
    alerts_by_day: dict[str, list[dict]] = {}
    forecast_rows = [r for r in rows if r and r.get("kind") == "forecast"]
    if forecast_rows:
        for a in forecast_alerts(forecast_rows, date.fromisoformat(forecast_rows[0]["date"]), days=16):
            alerts_by_day.setdefault(a["starts"], []).append(a)
    starts = {s.start: s.key for s in pred.stages}
    sowing = cycle.nursery_sowing_date or pred.start
    out = []
    for i, row in enumerate(rows):
        d = start + timedelta(days=i)
        stage, local = engine.stage_on(pred, d)
        gdd = stage.gdd_start + local * (stage.gdd_end - stage.gdd_start) if d >= pred.start else 0.0
        weather = None
        if row:
            weather = {k: row.get(k) for k in TIMELINE_WEATHER_FIELDS}
        out.append({
            "date": d, "das": (d - sowing).days,
            "dat": (d - cycle.anchor_date).days if cycle.anchor_type == "transplanting" else None,
            "stage_key": stage.key, "stage_local_progress": round(local, 4),
            "cycle_progress": round(engine.cycle_progress(pred, d), 4), "gdd_cumulative": round(gdd, 1),
            "weather": weather, "tasks": tasks_by_day.get(d, []),
            "events": [{"type": "stage_start", "stage_key": starts[d]}] if d in starts else [],
            "warnings": alerts_by_day.get(d.isoformat(), []) + stage_warnings(stage.key, row, d),
        })
    return out


def task_out(t: AgriculturalTask) -> dict:
    return {"id": t.id, "cycle_id": t.cycle_id, "title": t.title, "description": t.description,
            "category": t.category, "due_date": t.due_date, "window_end": t.window_end, "status": t.status,
            "weather_sensitive": t.weather_sensitive, "source": t.source, "completed_at": t.completed_at}
