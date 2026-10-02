from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class VarietySuggestIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    region: str | None = Field(None, max_length=80)
    force_ai: bool = False


class VarietyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    duration_days_range: tuple[int, int]
    grain_type: str | None = Field(None, max_length=80)
    aliases: list[str] = Field(default_factory=list, max_length=10)
    seasons: list[str] = Field(default_factory=list, max_length=8)
    regions: list[str] = Field(default_factory=list, max_length=10)
    notes: str | None = Field(None, max_length=600)
    source: Literal["user", "ai_suggested"] = "user"
    ai_model: str | None = Field(None, max_length=60)
    ai_confidence: Literal["low", "medium", "high"] | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Name is too short")
        return v

    @model_validator(mode="after")
    def check_range(self) -> "VarietyCreate":
        lo, hi = self.duration_days_range
        if not (30 <= lo <= hi <= 400):
            raise ValueError("Duration must be between 30 and 400 days, with min ≤ max")
        return self
