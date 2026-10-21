import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(os.environ.get("CARDMATICA_ROOT", Path(__file__).resolve().parents[3]))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    database_url: str = "postgresql+psycopg://cardmatica:CHANGE_ME@localhost:5432/cardmatica"
    admin_token: str = ""
    user_agent: str = "Cardmatica/0.1 (contact: REPLACE_WITH_CONTACT)"
    konami_enabled: bool = False
    konami_authorization_reference: str = ""
    yugipedia_enabled: bool = False
    yugipedia_request_interval: float = Field(default=1.0, ge=1.0)
    konami_request_interval: float = Field(default=2.0, ge=1.0)
    http_timeout: float = Field(default=25, gt=0)
    http_retries: int = Field(default=3, ge=0, le=8)
    cache_directory: Path = ROOT / ".cache/http"
    image_directory: Path = ROOT / "data/images"
    cors_origins: list[str] = ["http://localhost:8000", "http://localhost:5500"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
