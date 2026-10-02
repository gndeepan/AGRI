import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class SoilTestIn(BaseModel):
    sample_date: date
    lab_name: str | None = Field(default=None, max_length=160)
    ph: float | None = Field(default=None, ge=0, le=14)
    ec_ds_m: float | None = Field(default=None, ge=0, le=100)
    organic_carbon_pct: float | None = Field(default=None, ge=0, le=100)
    n_kg_ha: float | None = Field(default=None, ge=0, le=5000)
    p_kg_ha: float | None = Field(default=None, ge=0, le=5000)
    k_kg_ha: float | None = Field(default=None, ge=0, le=5000)
    texture: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=4000)


class SoilTestOut(SoilTestIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
