from datetime import date, datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator


class NameInput(BaseModel):
    language: str = Field(min_length=2, max_length=12)
    name: str = Field(min_length=1, max_length=300)
    current: bool = True


class ImageInput(BaseModel):
    file_title: str
    source_url: HttpUrl
    author: str | None = None
    license: str | None = None
    license_url: HttpUrl | None = None
    rights_status: Literal["unverified", "approved", "denied"] = "unverified"
    authorization_reference: str | None = None

    @model_validator(mode="after")
    def approval_requires_evidence(self):
        if self.rights_status == "approved" and not self.authorization_reference:
            raise ValueError("Una imagen aprobada requiere evidencia de autorización comercial")
        return self


class PrintingInput(BaseModel):
    code: str = Field(min_length=1, max_length=80)
    set_key: str = Field(min_length=1, max_length=200)
    set_name: str = Field(min_length=1, max_length=300)
    rarity: str = "Unknown"
    language: str
    market: Literal["TCG", "OCG"]
    edition: str = "unknown"
    artwork: str = "unknown"
    release_date: date | None = None
    set_release_date: date | None = None
    set_source_url: HttpUrl | None = None
    product_type: str | None = None
    images: list[ImageInput] = []

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value):
        return value.strip().upper()


class ArtworkInput(BaseModel):
    external_id: str
    source_url: HttpUrl
    small_source_url: HttpUrl | None = None


class GroupInput(BaseModel):
    name: str
    kind: Literal["archetype", "series"]
    relation: Literal["member", "supports", "related", "anti_supports"] = "member"


class TextInput(BaseModel):
    language: str
    text: str
    pendulum_text: str | None = None
    current: bool = False
    valid_from: date | None = None


class ErratumInput(BaseModel):
    key: str
    language: str
    old_text: str | None = None
    new_text: str | None = None
    explanation: str
    effective_date: date | None = None
    source_url: HttpUrl | None = None


class RelationInput(BaseModel):
    konami_id: int = Field(gt=0)
    relation: str = Field(max_length=80)


class BanlistInput(BaseModel):
    format: str = Field(min_length=1, max_length=60)
    effective_date: date
    status: Literal["forbidden", "limited", "semi_limited", "unlimited"]
    source_url: HttpUrl | None = None


class CardRecord(BaseModel):
    source: Literal["konami", "ygoprodeck", "yugipedia"]
    external_id: str = Field(min_length=1, max_length=200)
    url: HttpUrl
    language: str
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    revision: str | None = None
    konami_id: int | None = Field(default=None, gt=0)
    ygoprodeck_id: int | None = Field(default=None, gt=0)
    available_markets: list[Literal["TCG", "OCG"]] = []
    passcode: str | None = Field(default=None, pattern=r"^\d{8}$")
    names: list[NameInput] = Field(min_length=1)
    card_type: str | None = None
    subtypes: list[str] = []
    attribute: str | None = None
    level: int | None = Field(default=None, ge=0, le=13)
    rank: int | None = Field(default=None, ge=0, le=13)
    link_rating: int | None = Field(default=None, ge=1, le=8)
    atk: str | None = None
    defense: str | None = None
    pendulum_scale: int | None = Field(default=None, ge=0, le=13)
    printings: list[PrintingInput] = []
    artworks: list[ArtworkInput] = []
    groups: list[GroupInput] = []
    groups_complete: bool = False
    texts: list[TextInput] = []
    errata: list[ErratumInput] = []
    relations: list[RelationInput] = []
    banlist: list[BanlistInput] = []
    limitations: list[str] = []

    @field_validator("fetched_at")
    @classmethod
    def timezone_required(cls, value):
        if value.tzinfo is None:
            raise ValueError("fetched_at debe incluir zona horaria")
        return value

    @model_validator(mode="after")
    def source_identity(self):
        host = self.url.host
        if self.source == "konami":
            if host != "www.db.yugioh-card.com" or not self.konami_id:
                raise ValueError("Registro oficial sin identificador o URL de Konami")
            if self.external_id != str(self.konami_id):
                raise ValueError("El identificador externo debe ser el CID de Konami")
        elif self.source == "ygoprodeck":
            if host != "db.ygoprodeck.com" or not self.ygoprodeck_id:
                raise ValueError("YGOPRODeck requiere su propio identificador y URL de API")
            if self.external_id != str(self.ygoprodeck_id):
                raise ValueError("El identificador externo debe ser el ID de YGOPRODeck")
            for image in self.artworks:
                if image.source_url.host != "images.ygoprodeck.com" or (
                    image.small_source_url
                    and image.small_source_url.host != "images.ygoprodeck.com"
                ):
                    raise ValueError("Ilustración fuera del servidor de imágenes de YGOPRODeck")
        elif host != "yugipedia.com":
            raise ValueError("La URL complementaria debe pertenecer a Yugipedia")
        return self
