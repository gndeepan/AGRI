"""Idempotent seed: crop catalog, data-source metadata and an optional admin account."""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.crops.models import CropCatalog, CropGrowthStage, CropSuitabilityRule, CropVariety
from app.modules.environment.models import DataSourceMetadata
from app.modules.planning.models import CropCycle
from app.seed.crops import CROPS, DATA_SOURCES, SEASONS, TNAU_RICE

log = logging.getLogger(__name__)

VARIETY_DATA_KEYS = ("aliases", "grain_type", "group", "institute", "release_year", "regions", "duration_range",
                     "seasons_text")


def _reconcile_renamed(db: Session, catalog: dict[str, CropVariety], specs: list[dict]) -> None:
    """Catalog rows from an older seed that are no longer listed: rename them when an alias matches
    (keeps crop plans linked), otherwise delete them unless a crop plan still points at them."""
    names = {v["name"] for v in specs}
    by_alias = {a.lower(): v["name"] for v in specs for a in v.get("aliases", [])}
    for old_name, row in list(catalog.items()):
        if old_name in names:
            continue
        target = by_alias.get(old_name.lower())
        if target and target not in catalog:
            row.name = target
            catalog[target] = catalog.pop(old_name)
        elif not db.scalar(select(CropCycle.id).where(CropCycle.variety_id == row.id).limit(1)):
            db.delete(row)
            del catalog[old_name]
    db.flush()


def seed_crops(db: Session) -> None:
    for spec in CROPS:
        crop = db.scalar(select(CropCatalog).where(CropCatalog.slug == spec["slug"]))
        if crop is None:
            crop = CropCatalog(slug=spec["slug"])
            db.add(crop)
        data = dict(spec["data"])
        if "fractions" in spec:
            data["fractions"] = [list(f) for f in spec["fractions"]]
        crop.name_en, crop.name_ta = spec["name_en"], spec["name_ta"]
        crop.scientific_name, crop.category = spec["scientific_name"], spec["category"]
        crop.image_url, crop.confidence, crop.model_key = spec["image_url"], spec["confidence"], spec["model_key"]
        crop.data = data
        db.flush()

        stages = {s.key: s for s in crop.stages}
        for order, (key, en, ta) in enumerate(spec["stages"]):
            st = stages.get(key) or CropGrowthStage(key=key)
            st.name_en, st.name_ta, st.order = en, ta, order
            if key not in stages:
                crop.stages.append(st)

        catalog = {v.name: v for v in db.scalars(select(CropVariety).where(
            CropVariety.crop_id == crop.id, CropVariety.owner_id.is_(None)))}
        _reconcile_renamed(db, catalog, spec["varieties"])
        for v in spec["varieties"]:
            row = catalog.get(v["name"])
            if row is None:
                row = CropVariety(crop_id=crop.id, name=v["name"])
                db.add(row)
            row.duration_days, row.duration_group = v["duration_days"], v["duration_group"]
            row.seasons, row.notes = v["seasons"], v.get("notes")
            row.reference = v.get("reference") or TNAU_RICE
            row.source, row.verified = "catalog", v.get("verified", True)
            row.data = {k: v.get(k) for k in VARIETY_DATA_KEYS}

        rules = {(r.region, r.season_key): r for r in crop.rules}
        for r in spec["rules"]:
            season = SEASONS[r["season_key"]]
            row = rules.get((r["region"], r["season_key"])) or CropSuitabilityRule(
                region=r["region"], season_key=r["season_key"])
            row.sowing_start = r.get("sowing_start", season["sowing_window"]["start"])
            row.sowing_end = r.get("sowing_end", season["sowing_window"]["end"])
            row.notes = r.get("notes")
            row.reference = spec["data"]["references"][0]
            if (r["region"], r["season_key"]) not in rules:
                crop.rules.append(row)


def seed_data_sources(db: Session) -> None:
    for spec in DATA_SOURCES:
        row = db.scalar(select(DataSourceMetadata).where(DataSourceMetadata.key == spec["key"]))
        if row is None:
            row = DataSourceMetadata(key=spec["key"])
            db.add(row)
        for k, v in spec.items():
            setattr(row, k, v)


def seed_admin(db: Session) -> None:
    from app.modules.auth.service import create_user, find_active_user

    settings = get_settings()
    if not (settings.seed_admin_email and settings.seed_admin_password):
        return
    if find_active_user(db, settings.seed_admin_email):
        return
    from datetime import UTC, datetime

    user = create_user(db, settings.seed_admin_email, settings.seed_admin_password, "Administrator", role="admin")
    user.email_verified_at = datetime.now(UTC)
    log.info("seeded admin user")


def run_seed(db: Session) -> None:
    seed_crops(db)
    seed_data_sources(db)
    seed_admin(db)
    db.commit()
