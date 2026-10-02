from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

DataKind = Literal[
    "observed", "forecast", "climatology", "modelled", "user_entered", "simulated", "model_output"
]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LatLon(BaseModel):
    lat: float
    lon: float


class Provenance(BaseModel):
    provider: str
    dataset: str
    kind: DataKind
    retrieved_at: datetime
    resolution: str | None = None
    license: str | None = None
    attribution: str | None = None
    cache_status: Literal["fresh", "cached", "stale"] = "fresh"
    notes: list[str] = []


class Ref(BaseModel):
    title: str
    publisher: str
    url: str
