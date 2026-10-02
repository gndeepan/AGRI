from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    secret_key: str = "dev-insecure-secret-change-me"
    database_url: str = "postgresql+psycopg://bhoomi:bhoomi_dev@localhost:5432/bhoomi"
    redis_url: str = "redis://localhost:6379/0"
    frontend_origin: str = "http://localhost:5173"
    cookie_secure: bool = False

    access_token_minutes: int = 15
    refresh_token_days: int = 30
    email_token_hours: int = 24

    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "Bhoomi AI <no-reply@bhoomi.local>"

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"

    http_user_agent: str = "BhoomiAI/0.1 (contact: admin@bhoomi.local)"
    http_timeout_s: float = 15.0
    open_meteo_forecast_url: str = "https://api.open-meteo.com/v1/forecast"
    open_meteo_archive_url: str = "https://archive-api.open-meteo.com/v1/archive"
    open_meteo_elevation_url: str = "https://api.open-meteo.com/v1/elevation"
    open_meteo_api_key: str | None = None
    soilgrids_url: str = "https://rest.isric.org/soilgrids/v2.0/properties/query"
    nominatim_url: str = "https://nominatim.openstreetmap.org"

    weather_cache_minutes: int = 30
    soil_cache_days: int = 30
    climatology_years: int = 10
    worker_interval_s: int = 3600

    seed_admin_email: str | None = None
    seed_admin_password: str | None = None

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
