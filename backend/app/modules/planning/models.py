import datetime as dt
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, SoftDelete, Timestamps, UUIDPk, utcnow


class CropCycle(UUIDPk, Timestamps, SoftDelete, Base):
    __tablename__ = "crop_cycles"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    land_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("land_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    crop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("crop_catalog.id"), nullable=False)
    variety_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("crop_varieties.id"))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planned")
    method: Mapped[str] = mapped_column(String(30), nullable=False)
    anchor_date: Mapped[date] = mapped_column(Date, nullable=False)
    anchor_type: Mapped[str] = mapped_column(String(20), nullable=False)
    nursery_sowing_date: Mapped[date | None] = mapped_column(Date)
    irrigation_method: Mapped[str] = mapped_column(String(20), nullable=False)
    water_availability: Mapped[str] = mapped_column(String(20), nullable=False)
    planting_density: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    model_name: Mapped[str | None] = mapped_column(String(80))
    model_version: Mapped[str | None] = mapped_column(String(20))
    model_meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    harvest_earliest: Mapped[date | None] = mapped_column(Date)
    harvest_expected: Mapped[date | None] = mapped_column(Date)
    harvest_latest: Mapped[date | None] = mapped_column(Date)
    computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    predictions: Mapped[list["CropStagePrediction"]] = relationship(
        back_populates="cycle", order_by="CropStagePrediction.order", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_crop_cycles_owner_status", "owner_id", "status"),)


class CropStagePrediction(UUIDPk, Base):
    __tablename__ = "crop_stage_predictions"

    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crop_cycles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage_key: Mapped[str] = mapped_column(String(40), nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    start_earliest: Mapped[date] = mapped_column(Date, nullable=False)
    start_expected: Mapped[date] = mapped_column(Date, nullable=False)
    start_latest: Mapped[date] = mapped_column(Date, nullable=False)
    end_earliest: Mapped[date] = mapped_column(Date, nullable=False)
    end_expected: Mapped[date] = mapped_column(Date, nullable=False)
    end_latest: Mapped[date] = mapped_column(Date, nullable=False)
    gdd_start: Mapped[float] = mapped_column(Float, nullable=False)
    gdd_end: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="model_output")
    observed_on: Mapped[date | None] = mapped_column(Date)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    cycle: Mapped[CropCycle] = relationship(back_populates="predictions")


class AgriculturalTask(UUIDPk, Timestamps, SoftDelete, Base):
    __tablename__ = "agricultural_tasks"

    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crop_cycles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    window_end: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    weather_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="user")
    template_key: Mapped[str | None] = mapped_column(String(60))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class FieldObservation(UUIDPk, Timestamps, SoftDelete, Base):
    __tablename__ = "field_observations"

    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crop_cycles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    observed_on: Mapped[date] = mapped_column(Date, nullable=False)
    stage_key: Mapped[str | None] = mapped_column(String(40))
    plant_height_cm: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    pest_or_disease: Mapped[str | None] = mapped_column(String(160))
    severity: Mapped[str | None] = mapped_column(String(10))


class IrrigationRecord(UUIDPk, Timestamps, SoftDelete, Base):
    __tablename__ = "irrigation_records"

    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crop_cycles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    method: Mapped[str] = mapped_column(String(30), nullable=False)
    duration_hours: Mapped[float | None] = mapped_column(Float)
    water_depth_mm: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)


class InputApplication(UUIDPk, Timestamps, SoftDelete, Base):
    __tablename__ = "input_applications"

    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crop_cycles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    input_type: Mapped[str] = mapped_column(String(20), nullable=False)
    product: Mapped[str] = mapped_column(String(160), nullable=False)
    quantity: Mapped[float | None] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String(20))
    cost_inr: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)


class CropPhoto(UUIDPk, Timestamps, SoftDelete, Base):
    __tablename__ = "crop_photos"

    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crop_cycles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    object_key: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[str] = mapped_column(String(60), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    caption: Mapped[str | None] = mapped_column(Text)
    taken_on: Mapped[date | None] = mapped_column(Date)
