import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.core.schemas import LatLon, Provenance


class LandMetricsOut(BaseModel):
    area_m2: float
    area_ha: float
    area_acres: float
    perimeter_m: float
    centroid: LatLon
    representative_point: LatLon
    bbox: list[float]
    vertex_count: int


class ActiveCycleRef(BaseModel):
    id: uuid.UUID
    crop_name: str
    stage_key: str | None
    stage_name: str | None


class TerrainOut(BaseModel):
    elevation_m: float | None
    slope_deg: float | None
    relief_m: float | None
    provenance: Provenance


class LandSummary(BaseModel):
    id: uuid.UUID
    name: str
    metrics: LandMetricsOut
    boundary: dict[str, Any]
    active_cycle: ActiveCycleRef | None
    updated_at: datetime


class LandDetail(LandSummary):
    notes: str | None
    village: str | None
    district: str | None
    state: str | None
    terrain: TerrainOut | None
    boundary_disclaimer: str
    created_at: datetime


class BoundaryIn(BaseModel):
    boundary: dict[str, Any]


class LandCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    boundary: dict[str, Any]
    notes: str | None = Field(default=None, max_length=4000)


class LandPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    boundary: dict[str, Any] | None = None
    notes: str | None = Field(default=None, max_length=4000)


class GeoSearchResult(BaseModel):
    name: str | None
    display_name: str | None
    lat: float
    lon: float
    bbox: list[float] | None = None
    kind: str | None = None


class ReverseResult(BaseModel):
    village: str | None
    district: str | None
    state: str | None
    display_name: str | None
