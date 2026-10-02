import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, SoftDelete, Timestamps, UUIDPk, utcnow


class EnvironmentalObservation(UUIDPk, Base):
    """Observed/reanalysis or climatology series as retrieved. `raw` keeps the provider payload,
    `normalized` our schema; never mixed with model output."""

    __tablename__ = "environmental_observations"

    land_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("land_profiles.id", ondelete="SET NULL"), index=True
    )
    provider: Mapped[str] = mapped_column(String(60), nullable=False)
    dataset: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # observed | climatology
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    normalized: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    raw: Mapped[dict | None] = mapped_column(JSONB)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (Index("ix_env_obs_lookup", "provider", "kind", "lat", "lon", "start_date"),)


class WeatherForecast(UUIDPk, Base):
    __tablename__ = "weather_forecasts"

    land_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("land_profiles.id", ondelete="SET NULL"), index=True
    )
    provider: Mapped[str] = mapped_column(String(60), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    normalized: Mapped[dict] = mapped_column(JSONB, nullable=False)
    raw: Mapped[dict | None] = mapped_column(JSONB)

    __table_args__ = (Index("ix_weather_forecasts_loc", "lat", "lon", "retrieved_at"),)


class SoilProfile(UUIDPk, Base):
    __tablename__ = "soil_profiles"

    land_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("land_profiles.id", ondelete="SET NULL"), index=True
    )
    provider: Mapped[str] = mapped_column(String(60), nullable=False)
    dataset: Mapped[str] = mapped_column(String(120), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    resolution: Mapped[str | None] = mapped_column(String(40))
    normalized: Mapped[dict] = mapped_column(JSONB, nullable=False)
    raw: Mapped[dict | None] = mapped_column(JSONB)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (Index("ix_soil_profiles_loc", "lat", "lon", "retrieved_at"),)


class SoilTest(UUIDPk, Timestamps, SoftDelete, Base):
    __tablename__ = "soil_tests"

    land_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("land_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sample_date: Mapped[date] = mapped_column(Date, nullable=False)
    lab_name: Mapped[str | None] = mapped_column(String(160))
    ph: Mapped[float | None] = mapped_column(Float)
    ec_ds_m: Mapped[float | None] = mapped_column(Float)
    organic_carbon_pct: Mapped[float | None] = mapped_column(Float)
    n_kg_ha: Mapped[float | None] = mapped_column(Float)
    p_kg_ha: Mapped[float | None] = mapped_column(Float)
    k_kg_ha: Mapped[float | None] = mapped_column(Float)
    texture: Mapped[str | None] = mapped_column(String(60))
    notes: Mapped[str | None] = mapped_column(Text)


class DataSourceMetadata(UUIDPk, Timestamps, Base):
    __tablename__ = "data_source_metadata"

    key: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    provider: Mapped[str] = mapped_column(String(120), nullable=False)
    url: Mapped[str | None] = mapped_column(String(300))
    license: Mapped[str | None] = mapped_column(String(160))
    attribution: Mapped[str | None] = mapped_column(String(300))
    coverage: Mapped[str | None] = mapped_column(String(200))
    resolution: Mapped[str | None] = mapped_column(String(80))
    update_frequency: Mapped[str | None] = mapped_column(String(120))
    rate_limit: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)


class ProviderHealth(UUIDPk, Base):
    """Periodic snapshot (written by the worker) of the live Redis health counters."""

    __tablename__ = "provider_health"

    provider: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    calls: Mapped[int] = mapped_column(nullable=False, default=0)
    errors: Mapped[int] = mapped_column(nullable=False, default=0)
    p50_latency_ms: Mapped[float | None] = mapped_column(Float)
    last_success_at: Mapped[str | None] = mapped_column(String(40))
    last_error_at: Mapped[str | None] = mapped_column(String(40))
    last_error: Mapped[str | None] = mapped_column(Text)
    circuit_state: Mapped[str] = mapped_column(String(20), nullable=False, default="closed")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
