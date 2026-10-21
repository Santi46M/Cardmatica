from datetime import date, datetime
from typing import Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class ImageView(BaseModel):
    id: UUID
    url: str | None = None
    thumbnail_url: str | None = None
    source_url: str
    author: str | None = None
    license: str | None = None
    license_url: str | None = None
    rights_status: str
    fallback_reason: str | None = None


class PrintingView(BaseModel):
    id: UUID
    card_id: UUID
    code: str
    set_id: UUID
    set_name: str
    rarity: str
    language: str
    market: str
    edition: str
    artwork: str
    release_date: date | None
    images: list[ImageView]


class CardSummary(BaseModel):
    id: UUID
    konami_id: int | None
    name: str
    name_is_official: bool
    card_type: str | None
    subtypes: list[str]
    attribute: str | None
    markets: list[str]
    printing_count: int
    image: ImageView | None
    updated_at: datetime


class NameView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    language: str
    name: str
    is_current: bool
    is_official: bool


class TextView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    language: str
    text: str
    pendulum_text: str | None
    is_official: bool
    is_current: bool
    valid_from: date | None


class GroupView(BaseModel):
    id: UUID
    name: str
    relation: str
    source_classification: str = "community"


class SourceView(BaseModel):
    source: str
    url: str
    fetched_at: datetime
    validation_status: str


class FieldView(BaseModel):
    entity: str
    field: str
    source: str
    observed_at: datetime
    status: str
    source_url: str | None = None


class ErratumView(BaseModel):
    id: UUID
    language: str
    explanation: str
    effective_date: date | None
    classification: str
    old_text: TextView | None
    new_text: TextView | None


class CardDetail(CardSummary):
    passcode: str | None
    names: list[NameView]
    level: int | None
    rank: int | None
    link_rating: int | None
    atk: str | None
    defense: str | None
    pendulum_scale: int | None
    texts: list[TextView]
    archetypes: list[GroupView]
    series: list[GroupView]
    sources: list[SourceView]
    provenance: list[FieldView]
    errata: list[ErratumView]
    banlist: list[dict]
    relations: list[dict]


class NamedView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str


class SetView(NamedView):
    language: str
    market: str
    release_date: date | None
    product_type: str | None


class JobRequest(BaseModel):
    source: Literal["konami", "yugipedia"]
    mode: Literal["initial", "incremental", "card", "images", "errata", "retry", "banlist"]
    identifier: str | None = Field(default=None, max_length=200)
    language: Literal["en", "es", "fr", "de", "it", "pt", "ja", "ko", "ae"] = "en"
    since: datetime | None = None
    retry_job_id: UUID | None = None
    max_cards: int = Field(default=3, ge=1, le=100000)
    banlist_format: Literal["TCG", "OCG"] | None = None
    effective_date: date | None = None

    @model_validator(mode="after")
    def validate_mode(self):
        if self.mode == "banlist" and (
            self.source != "konami" or not self.banlist_format or not self.effective_date
        ):
            raise ValueError("Banlist requiere Konami, formato y fecha efectiva revisados")
        if self.mode == "banlist" and (
            (self.banlist_format == "OCG") != (self.language in {"ja", "ko"})
        ):
            raise ValueError("El idioma de la lista debe corresponder a su formato TCG/OCG")
        if self.mode in {"card", "errata", "images"} and not self.identifier:
            raise ValueError("Este modo requiere identifier")
        if self.mode == "incremental" and self.source == "yugipedia" and not self.since:
            raise ValueError("Yugipedia incremental requiere since")
        if self.since and self.since.tzinfo is None:
            raise ValueError("since debe incluir zona horaria")
        if self.mode == "retry" and not self.retry_job_id:
            raise ValueError("retry requiere retry_job_id")
        if self.mode == "images" and self.source != "yugipedia":
            raise ValueError("Las imágenes se mantienen desde Yugipedia")
        return self


class JobView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    source: str
    mode: str
    status: str
    processed: int
    failures: int
    cursor: dict
    started_at: datetime | None
    finished_at: datetime | None
