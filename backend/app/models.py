"""Import every model so Base.metadata is complete (Alembic, tests)."""

from app.modules.assistant.models import AIConversation, AIMessage
from app.modules.crops.models import CropCatalog, CropGrowthStage, CropSuitabilityRule, CropVariety
from app.modules.environment.models import (
    DataSourceMetadata,
    EnvironmentalObservation,
    ProviderHealth,
    SoilProfile,
    SoilTest,
    WeatherForecast,
)
from app.modules.lands.models import LandBoundary, LandProfile
from app.modules.planning.models import (
    AgriculturalTask,
    CropCycle,
    CropPhoto,
    CropStagePrediction,
    FieldObservation,
    InputApplication,
    IrrigationRecord,
)
from app.modules.users.models import AuditLog, EmailToken, Notification, RefreshToken, User, UserPreferences

__all__ = [
    "AIConversation", "AIMessage", "AgriculturalTask", "AuditLog", "CropCatalog", "CropCycle",
    "CropGrowthStage", "CropPhoto", "CropStagePrediction", "CropSuitabilityRule", "CropVariety",
    "DataSourceMetadata", "EmailToken", "EnvironmentalObservation", "FieldObservation",
    "InputApplication", "IrrigationRecord", "LandBoundary", "LandProfile", "Notification",
    "ProviderHealth", "RefreshToken", "SoilProfile", "SoilTest", "User", "UserPreferences",
    "WeatherForecast",
]
