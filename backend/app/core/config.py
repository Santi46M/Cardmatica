import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(os.environ.get("CARDMATICA_ROOT", Path(__file__).resolve().parents[3]))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    database_url: str = Field(
        default="postgresql+psycopg://cardmatica:CHANGE_ME@localhost:5432/cardmatica", repr=False
    )
    admin_token: str = Field(default="", repr=False)
    user_agent: str = "Cardmatica/0.2 (catalog maintenance)"
    ygoprodeck_enabled: bool = True
    ygoprodeck_request_interval: float = Field(default=1.0, ge=0.05)
    deployment_mode: str = "production"
    allow_local_image_preview: bool = False
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

    @property
    def local_image_preview(self) -> bool:
        return self.deployment_mode == "local" and self.allow_local_image_preview


@lru_cache
def get_settings() -> Settings:
    return Settings()
