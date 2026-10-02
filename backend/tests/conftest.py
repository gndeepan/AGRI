import os

import fakeredis
import pytest

from app.core.http import reset_breakers
from app.core.redis import set_redis

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://bhoomi:bhoomi_dev@localhost:5432/bhoomi_test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")


@pytest.fixture(autouse=True)
def fake_redis():
    client = fakeredis.FakeRedis(decode_responses=True)
    set_redis(client)
    reset_breakers()
    yield client
    set_redis(None)
    reset_breakers()


def square(lon: float, lat: float, side_m: float) -> dict:
    """Geodesic square (synthetic field) with SW corner at lon/lat."""
    from app.modules.lands.geo import GEOD

    e_lon, e_lat, _ = GEOD.fwd(lon, lat, 90, side_m)
    ne_lon, ne_lat, _ = GEOD.fwd(e_lon, e_lat, 0, side_m)
    n_lon, n_lat, _ = GEOD.fwd(lon, lat, 0, side_m)
    return {"type": "Polygon", "coordinates": [[[lon, lat], [e_lon, e_lat], [ne_lon, ne_lat], [n_lon, n_lat], [lon, lat]]]}


# ---------------- database-backed fixtures (skipped when PostgreSQL is unreachable) ----------------

def _db_reachable(url: str) -> bool:
    from sqlalchemy import create_engine, text

    try:
        engine = create_engine(url, connect_args={"connect_timeout": 2})
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        engine.dispose()
        return True
    except Exception:  # noqa: BLE001
        return False


def pytest_collection_modifyitems(config, items):
    if not any("db" in item.keywords for item in items):
        return
    if _db_reachable(os.environ["DATABASE_URL"]):
        return
    skip = pytest.mark.skip(reason=f"PostgreSQL not reachable at {os.environ['DATABASE_URL']}")
    for item in items:
        if "db" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(scope="session")
def migrated():
    from alembic.config import Config

    from alembic import command

    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    return cfg


@pytest.fixture
def db(migrated):
    from sqlalchemy import text

    import app.models  # noqa: F401
    from app.core.db import Base, SessionLocal
    from app.seed import run_seed

    session = SessionLocal()
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    session.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    session.commit()
    run_seed(session)
    yield session
    session.close()


@pytest.fixture
def fakes(monkeypatch):
    from tests import fakes as f

    weather = f.FakeWeather()
    monkeypatch.setattr("app.modules.environment.service.OpenMeteoWeather", lambda: weather)
    monkeypatch.setattr("app.modules.environment.service.SoilGridsProvider", lambda: f.FakeSoil())
    monkeypatch.setattr("app.modules.environment.service.OpenMeteoElevation", lambda: f.FakeElevation())
    monkeypatch.setattr("app.modules.lands.service.NominatimGeocoder", f.FakeGeocoder)
    monkeypatch.setattr("app.modules.lands.router.NominatimGeocoder", f.FakeGeocoder)
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr("app.modules.auth.service.send_email", lambda to, subject, body: sent.append((to, subject, body)))
    return {"weather": weather, "emails": sent}


@pytest.fixture
def api(db, fakes):
    from fastapi.testclient import TestClient

    from app.main import app

    def make_client() -> TestClient:
        return TestClient(app, headers={"X-Requested-With": "bhoomi"})

    return make_client


def register(client, email: str = "farmer@example.com", password: str = "paddy-field-2026", name: str = "Test Farmer"):
    r = client.post("/api/v1/auth/register", json={"email": email, "password": password, "full_name": name})
    assert r.status_code == 201, r.text
    return r.json()
