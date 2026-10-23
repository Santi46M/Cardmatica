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
    # Private development hosts treated like localhost for the image preview,
    # e.g. [".app.github.dev"] for a Codespace whose port stays private.
    local_preview_host_suffixes: list[str] = []
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
    # Host names the site answers to. "*" accepts any; set the real domain in
    # production, e.g. ["cardmatica.com", "www.cardmatica.com"].
    allowed_hosts: list[str] = ["*"]
    # Accounts (app/services/accounts.py).
    # Days a "remember me" session lasts; without it, hours.
    session_days: int = Field(default=30, ge=1, le=365)
    session_short_hours: int = Field(default=12, ge=1, le=72)
    # Failed logins in a row before the account locks, and for how long.
    login_max_failures: int = Field(default=5, ge=3, le=20)
    login_lock_minutes: int = Field(default=15, ge=1, le=1440)
    # Login and registration attempts allowed per IP address per minute.
    auth_attempts_per_minute: int = Field(default=10, ge=1, le=120)

    @property
    def local_image_preview(self) -> bool:
        return self.deployment_mode == "local" and self.allow_local_image_preview

    def is_preview_host(self, hostname: str | None) -> bool:
        if not hostname:
            return False
        hostname = hostname.lower()
        if hostname in {"localhost", "127.0.0.1", "::1", "testserver"}:
            return True
        return any(
            suffix.startswith(".") and hostname.endswith(suffix.lower())
            for suffix in self.local_preview_host_suffixes
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
