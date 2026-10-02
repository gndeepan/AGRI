import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Language = Literal["en", "ta"]


class UserPreferencesOut(BaseModel):
    language: Language = "en"
    region: str | None = None
    area_unit: Literal["acre", "hectare"] = "acre"
    timezone: str = "Asia/Kolkata"


class UserPreferencesPatch(BaseModel):
    language: Language | None = None
    region: str | None = Field(default=None, max_length=120)
    area_unit: Literal["acre", "hectare"] | None = None
    timezone: str | None = Field(default=None, max_length=64)


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: Literal["farmer", "admin"]
    email_verified: bool
    preferences: UserPreferencesOut
    created_at: datetime


class UserPatch(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    preferences: UserPreferencesPatch | None = None


class DeleteAccount(BaseModel):
    password: str


def user_out(user) -> UserOut:
    prefs = user.preferences
    return UserOut(
        id=user.id, email=user.email, full_name=user.full_name, role=user.role,
        email_verified=user.email_verified_at is not None,
        preferences=UserPreferencesOut(
            language=prefs.language, region=prefs.region, area_unit=prefs.area_unit, timezone=prefs.timezone
        ) if prefs else UserPreferencesOut(),
        created_at=user.created_at,
    )
