import datetime as dt
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Method = Literal["transplanting", "direct_seeding_wet", "direct_seeding_dry", "sowing"]
IrrigationMethod = Literal["flood", "awd", "drip", "sprinkler", "rainfed"]
WaterAvailability = Literal["assured", "limited", "rainfed"]
CycleStatus = Literal["planned", "active", "harvested", "abandoned"]
TaskCategory = Literal["irrigation", "nutrient", "weed", "pest_scouting", "field_prep", "harvest", "observation",
                       "custom"]


class CycleCreate(BaseModel):
    land_id: uuid.UUID
    crop_slug: str
    variety_id: uuid.UUID | None = None
    method: Method
    anchor_date: date
    anchor_type: Literal["sowing", "transplanting"]
    nursery_sowing_date: date | None = None
    irrigation_method: IrrigationMethod
    water_availability: WaterAvailability
    planting_density: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def check(self) -> "CycleCreate":
        if self.method == "transplanting" and self.anchor_type != "transplanting":
            raise ValueError("Transplanted crops are anchored on the transplanting date")
        if self.method != "transplanting" and self.anchor_type != "sowing":
            raise ValueError("Direct-seeded crops are anchored on the sowing date")
        if self.nursery_sowing_date and self.nursery_sowing_date >= self.anchor_date:
            raise ValueError("Nursery sowing must be before transplanting")
        return self


class CyclePatch(BaseModel):
    variety_id: uuid.UUID | None = None
    status: CycleStatus | None = None
    method: Method | None = None
    anchor_type: Literal["sowing", "transplanting"] | None = None
    anchor_date: date | None = None
    nursery_sowing_date: date | None = None
    irrigation_method: IrrigationMethod | None = None
    water_availability: WaterAvailability | None = None
    planting_density: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def no_null_required(self) -> "CyclePatch":
        # Optional in a PATCH, but these columns can't be cleared.
        for key in ("status", "method", "anchor_type", "anchor_date", "irrigation_method", "water_availability"):
            if key in self.model_fields_set and getattr(self, key) is None:
                raise ValueError(f"{key} cannot be null")
        return self


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    category: TaskCategory = "custom"
    due_date: date
    window_end: date | None = None
    weather_sensitive: bool = False


class TaskPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    due_date: date | None = None
    window_end: date | None = None
    status: Literal["pending", "done", "skipped"] | None = None


class TaskOut(BaseModel):
    id: uuid.UUID
    cycle_id: uuid.UUID
    title: str
    description: str
    category: str
    due_date: date
    window_end: date | None
    status: str
    weather_sensitive: bool
    source: str
    completed_at: datetime | None


class ObservationIn(BaseModel):
    observed_on: date
    stage_key: str | None = Field(default=None, max_length=40)
    plant_height_cm: float | None = Field(default=None, ge=0, le=600)
    notes: str = Field(default="", max_length=4000)
    pest_or_disease: str | None = Field(default=None, max_length=160)
    severity: Literal["low", "medium", "high"] | None = None


class ObservationOut(ObservationIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    cycle_id: uuid.UUID
    created_at: datetime


class IrrigationIn(BaseModel):
    date: dt.date
    method: str = Field(min_length=1, max_length=30)
    duration_hours: float | None = Field(default=None, ge=0, le=240)
    water_depth_mm: float | None = Field(default=None, ge=0, le=500)
    notes: str | None = Field(default=None, max_length=4000)


class IrrigationOut(IrrigationIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    cycle_id: uuid.UUID
    created_at: datetime


class InputIn(BaseModel):
    date: dt.date
    input_type: Literal["fertilizer", "pesticide", "seed", "labour", "machinery", "other"]
    product: str = Field(min_length=1, max_length=160)
    quantity: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=20)
    cost_inr: float | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=4000)


class InputOut(InputIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    cycle_id: uuid.UUID
    created_at: datetime
