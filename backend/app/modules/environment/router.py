import uuid
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Query, Response
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.core.errors import AppError, not_found
from app.core.http import ProviderError
from app.modules.environment.models import SoilTest
from app.modules.environment.schemas import SoilTestIn, SoilTestOut
from app.modules.environment.service import EnvironmentService
from app.modules.lands.service import current_boundary, get_owned_land

router = APIRouter(prefix="/lands/{land_id}", tags=["environment"])


@router.get("/weather")
def weather(land_id: uuid.UUID, user: CurrentUser, db: DB) -> dict:
    land = get_owned_land(db, user, land_id)
    return EnvironmentService(db).weather_bundle(land.centroid_lat, land.centroid_lon, land.id)


@router.get("/weather/daily")
def weather_daily(land_id: uuid.UUID, user: CurrentUser, db: DB, start: date | None = Query(None),
                  end: date | None = Query(None)) -> list[dict | None]:
    land = get_owned_land(db, user, land_id)
    start = start or date.today() - timedelta(days=30)
    end = end or date.today() + timedelta(days=15)
    if end < start or (end - start).days > 400:
        raise AppError(422, "Date range must be positive and at most 400 days", "invalid_range")
    rows, _ = EnvironmentService(db).daily_series(land.centroid_lat, land.centroid_lon, start, end, land.id)
    return rows


def _soil_tests(db: DB, land_id: uuid.UUID) -> list[SoilTest]:
    return list(db.scalars(select(SoilTest).where(SoilTest.land_id == land_id, SoilTest.deleted_at.is_(None))
                           .order_by(SoilTest.sample_date.desc())))


@router.get("/soil")
def soil(land_id: uuid.UUID, user: CurrentUser, db: DB) -> dict:
    land = get_owned_land(db, user, land_id)
    tests = [SoilTestOut.model_validate(t, from_attributes=True).model_dump(mode="json") for t in _soil_tests(db, land.id)]
    try:
        profile = EnvironmentService(db).soil_profile(land.centroid_lat, land.centroid_lon, land.id)
    except AppError:
        profile = {
            "texture_class": None, "layers": [], "drainage_hint": None, "irrigation_suitability": None,
            "limitations": ["Soil estimate provider is unavailable right now. Soil-test results are shown if entered."],
            "provenance": {"provider": "soilgrids", "dataset": "ISRIC SoilGrids v2.0", "kind": "modelled",
                           "retrieved_at": datetime.now(UTC).isoformat(), "cache_status": "stale",
                           "notes": ["unavailable"]},
        }
    return {**profile, "soil_tests": tests}


@router.post("/soil-tests", response_model=SoilTestOut, status_code=201)
def add_soil_test(land_id: uuid.UUID, body: SoilTestIn, user: CurrentUser, db: DB) -> SoilTest:
    land = get_owned_land(db, user, land_id)
    test = SoilTest(land_id=land.id, owner_id=user.id, **body.model_dump())
    db.add(test)
    db.commit()
    db.refresh(test)
    return test


@router.delete("/soil-tests/{test_id}", status_code=204)
def delete_soil_test(land_id: uuid.UUID, test_id: uuid.UUID, user: CurrentUser, db: DB) -> Response:
    land = get_owned_land(db, user, land_id)
    test = db.scalar(select(SoilTest).where(SoilTest.id == test_id, SoilTest.land_id == land.id,
                                            SoilTest.deleted_at.is_(None)))
    if test is None:
        raise not_found("Soil test")
    test.deleted_at = datetime.now(UTC)
    db.commit()
    return Response(status_code=204)


@router.get("/terrain")
def terrain(land_id: uuid.UUID, user: CurrentUser, db: DB) -> dict:
    land = get_owned_land(db, user, land_id)
    if land.terrain:
        return land.terrain
    ring = current_boundary(land).metrics["geojson"]["coordinates"][0][:-1]
    try:
        result = EnvironmentService(db).terrain((land.centroid_lat, land.centroid_lon), [(p[1], p[0]) for p in ring])
    except ProviderError as exc:
        raise AppError(503, "Elevation provider is unavailable", "provider_unavailable") from exc
    land.terrain = result
    db.commit()
    return result
