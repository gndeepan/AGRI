"""Background worker: hourly weather refresh, prediction recompute, notifications,
provider-health snapshots and retention purge. One instance runs at a time (Redis lock)."""

import logging
import signal
import threading
import time
from datetime import UTC, date, datetime, timedelta

import redis
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.errors import AppError
from app.core.http import provider_health_snapshot
from app.core.logging import configure_logging
from app.core.redis import get_redis
from app.modules.admin.router import PROVIDERS
from app.modules.environment.models import ProviderHealth
from app.modules.environment.service import EnvironmentService, round_loc
from app.modules.lands.models import LandProfile
from app.modules.planning import service as planning
from app.modules.planning.models import AgriculturalTask, CropCycle
from app.modules.users.models import Notification, User

log = logging.getLogger("bhoomi.worker")
LOCK_KEY = "worker:lock"
RETENTION_DAYS = 30
stop = threading.Event()


def notify(db: Session, user_id, kind: str, title: str, body: str, link: str | None, dedupe_key: str) -> None:
    db.execute(insert(Notification).values(user_id=user_id, kind=kind, title=title, body=body, link=link,
                                           dedupe_key=dedupe_key, created_at=datetime.now(UTC))
               .on_conflict_do_nothing(index_elements=["user_id", "dedupe_key"]))


def refresh_cycles(db: Session) -> int:
    today = date.today()
    cycles = list(db.scalars(select(CropCycle).options(selectinload(CropCycle.predictions)).where(
        CropCycle.deleted_at.is_(None), CropCycle.status.in_(planning.ACTIVE_STATUSES))))
    env = EnvironmentService(db)
    refreshed_locs: set[tuple[float, float]] = set()
    for cycle in cycles:
        land = db.get(LandProfile, cycle.land_id)
        if land is None or land.deleted_at is not None:
            continue
        loc = round_loc(land.centroid_lat, land.centroid_lon)
        bundle = None
        if loc not in refreshed_locs:
            get_redis().delete(f"wx:fc:{loc[0]}:{loc[1]}")  # force a fresh forecast once per location
            refreshed_locs.add(loc)
        try:
            bundle = env.weather_bundle(land.centroid_lat, land.centroid_lon, land.id)
            planning.compute(db, cycle, env)
            planning.refresh_status(cycle, today)
        except AppError as exc:
            log.warning("cycle refresh skipped", extra={"cycle_id": str(cycle.id), "error": exc.detail})
        link = f"/app/plans/{cycle.id}"
        for alert in (bundle or {}).get("alerts", []):
            notify(db, cycle.owner_id, "alert", f"{land.name}: {alert['title']}", alert["message"], link,
                   f"{alert['id']}:{land.id}")
        due = db.scalars(select(AgriculturalTask).where(
            AgriculturalTask.cycle_id == cycle.id, AgriculturalTask.status == "pending",
            AgriculturalTask.deleted_at.is_(None), AgriculturalTask.due_date.between(today, today + timedelta(days=1))))
        for task in due:
            notify(db, cycle.owner_id, "task", f"{land.name}: {task.title}", f"Due {task.due_date:%d %b}", link,
                   f"task:{task.id}:{task.due_date}")
        db.commit()
    return len(cycles)


def snapshot_provider_health(db: Session) -> None:
    for name in PROVIDERS:
        snap = provider_health_snapshot(name)
        if not snap["calls"]:
            continue
        values = {k: snap[k] for k in ("calls", "errors", "p50_latency_ms", "last_success_at", "last_error_at",
                                       "last_error", "circuit_state")}
        db.execute(insert(ProviderHealth).values(provider=name, updated_at=datetime.now(UTC), **values)
                   .on_conflict_do_update(index_elements=["provider"],
                                          set_={**values, "updated_at": datetime.now(UTC)}))
    db.commit()


def purge_deleted_accounts(db: Session) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=RETENTION_DAYS)
    result = db.execute(delete(User).where(User.deleted_at.is_not(None), User.deleted_at < cutoff))
    db.commit()
    return result.rowcount or 0


def run_once() -> None:
    with SessionLocal() as db:
        n = refresh_cycles(db)
        snapshot_provider_health(db)
        purged = purge_deleted_accounts(db)
    log.info("worker pass complete", extra={"cycles": n, "purged_users": purged})


def main() -> None:
    configure_logging()
    settings = get_settings()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    log.info("worker started", extra={"interval_s": settings.worker_interval_s})
    while not stop.is_set():
        started = time.monotonic()
        try:
            lock = get_redis().lock(LOCK_KEY, timeout=settings.worker_interval_s, blocking=False)
            if lock.acquire():
                try:
                    run_once()
                finally:
                    try:
                        lock.release()
                    except redis.exceptions.LockError:
                        pass
        except Exception:  # noqa: BLE001 - keep the loop alive; error is logged
            log.exception("worker pass failed")
        stop.wait(max(5.0, settings.worker_interval_s - (time.monotonic() - started)))
    log.info("worker stopped")


if __name__ == "__main__":
    main()
