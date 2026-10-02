import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, SoftDelete, Timestamps, UUIDPk, utcnow


class LandProfile(UUIDPk, Timestamps, SoftDelete, Base):
    __tablename__ = "land_profiles"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    village: Mapped[str | None] = mapped_column(String(120))
    district: Mapped[str | None] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(120))
    centroid_lat: Mapped[float] = mapped_column(Float, nullable=False)
    centroid_lon: Mapped[float] = mapped_column(Float, nullable=False)
    terrain: Mapped[dict | None] = mapped_column(JSONB)

    boundaries: Mapped[list["LandBoundary"]] = relationship(
        back_populates="land", order_by="LandBoundary.version", cascade="all, delete-orphan"
    )


class LandBoundary(UUIDPk, Base):
    """Versioned boundary; editing a land appends a new version and flips is_current."""

    __tablename__ = "land_boundaries"

    land_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("land_profiles.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    geom = mapped_column(Geometry("POLYGON", srid=4326, spatial_index=False), nullable=False)
    area_m2: Mapped[float] = mapped_column(Float, nullable=False)
    perimeter_m: Mapped[float] = mapped_column(Float, nullable=False)
    metrics: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    land: Mapped[LandProfile] = relationship(back_populates="boundaries")

    __table_args__ = (
        UniqueConstraint("land_id", "version", name="uq_land_boundaries_version"),
        Index("ix_land_boundaries_geom", "geom", postgresql_using="gist"),
        Index("ix_land_boundaries_current", "land_id", postgresql_where=text("is_current")),
    )
