import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint, and_, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, Timestamps, UUIDPk


class CropCatalog(UUIDPk, Timestamps, Base):
    __tablename__ = "crop_catalog"

    slug: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    name_en: Mapped[str] = mapped_column(String(120), nullable=False)
    name_ta: Mapped[str] = mapped_column(String(120), nullable=False)
    scientific_name: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(300))
    # Agronomic ranges, seasons, description, references (see app/seed/crops.py).
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    confidence: Mapped[str] = mapped_column(String(20), nullable=False, default="preliminary")
    model_key: Mapped[str] = mapped_column(String(60), nullable=False, default="stage_fraction")

    # Catalog varieties only; farmers' own varieties (owner_id set) are loaded per user.
    varieties: Mapped[list["CropVariety"]] = relationship(
        primaryjoin=lambda: and_(CropCatalog.id == CropVariety.crop_id, CropVariety.owner_id.is_(None)),
        order_by="CropVariety.duration_days", viewonly=True,
    )
    stages: Mapped[list["CropGrowthStage"]] = relationship(
        back_populates="crop", order_by="CropGrowthStage.order", cascade="all, delete-orphan"
    )
    rules: Mapped[list["CropSuitabilityRule"]] = relationship(
        back_populates="crop", cascade="all, delete-orphan"
    )


class CropVariety(UUIDPk, Timestamps, Base):
    """A catalog variety (owner_id NULL) or a farmer's own variety (owner_id set, never shared)."""

    __tablename__ = "crop_varieties"

    crop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crop_catalog.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_group: Mapped[str] = mapped_column(String(10), nullable=False)
    seasons: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(Text)
    reference: Mapped[dict | None] = mapped_column(JSONB)
    # catalog | user | ai_suggested
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="catalog")
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # aliases, grain_type, institute, release_year, group, regions, duration_range, ai details
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    crop: Mapped[CropCatalog] = relationship()

    __table_args__ = (
        Index("uq_crop_varieties_catalog_name", "crop_id", "name", unique=True,
              postgresql_where=text("owner_id IS NULL")),
        Index("uq_crop_varieties_owner_name", "crop_id", "owner_id", "name", unique=True,
              postgresql_where=text("owner_id IS NOT NULL")),
    )


class CropGrowthStage(UUIDPk, Base):
    """Stage template. `params` holds model parameters, e.g. fixed reference days or a
    fraction of total duration."""

    __tablename__ = "crop_growth_stages"

    crop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crop_catalog.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(40), nullable=False)
    name_en: Mapped[str] = mapped_column(String(80), nullable=False)
    name_ta: Mapped[str] = mapped_column(String(80), nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    crop: Mapped[CropCatalog] = relationship(back_populates="stages")

    __table_args__ = (UniqueConstraint("crop_id", "key", name="uq_crop_growth_stages_key"),)


class CropSuitabilityRule(UUIDPk, Timestamps, Base):
    __tablename__ = "crop_suitability_rules"

    crop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crop_catalog.id", ondelete="CASCADE"), nullable=False, index=True
    )
    region: Mapped[str] = mapped_column(String(20), nullable=False)  # ISO 3166-2 e.g. IN-TN
    season_key: Mapped[str] = mapped_column(String(30), nullable=False)
    sowing_start: Mapped[str] = mapped_column(String(5), nullable=False)  # MM-DD
    sowing_end: Mapped[str] = mapped_column(String(5), nullable=False)
    rule: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    reference: Mapped[dict | None] = mapped_column(JSONB)
    notes: Mapped[str | None] = mapped_column(Text)

    crop: Mapped[CropCatalog] = relationship(back_populates="rules")

    __table_args__ = (UniqueConstraint("crop_id", "region", "season_key", name="uq_crop_rules"),)
