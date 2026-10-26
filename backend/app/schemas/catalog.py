from datetime import date, datetime, timezone
from decimal import Decimal
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
    association: Literal["printing", "card_artwork"] = "printing"
    usage_scope: str = "commercial_permission_verified"


class PrintingView(BaseModel):
    id: UUID
    card_id: UUID
    code: str
    set_id: UUID
    set_name: str
    rarity: str
    # Yugipedia abbreviation and family (app/services/rarities.py).
    rarity_code: str | None = None
    rarity_family: str = "other"
    language: str
    market: str
    edition: str
    artwork: str
    release_date: date | None
    images: list[ImageView]


class CardTypesView(BaseModel):
    """A card's type line split into levels (see app/services/card_types.py)."""

    kind: str | None
    frame: str | None = None
    pendulum: bool = False
    abilities: list[str] = []
    race: str | None = None
    property: str | None = None
    attribute: str | None = None
    level: int | None = None
    rank: int | None = None
    link_rating: int | None = None


class CardSummary(BaseModel):
    id: UUID
    konami_id: int | None
    ygoprodeck_id: int | None = None
    name_source: str | None = None
    name: str
    name_is_official: bool
    card_type: str | None
    subtypes: list[str]
    attribute: str | None
    types: CardTypesView | None = None
    markets: list[str]
    printing_count: int
    image: ImageView | None
    updated_at: datetime
    # Latest storefront sale for the requested market; only filled by the card list.
    last_sale: "PricePoint | None" = None
    # Banlist status for the requested market; only filled by the card list.
    market_banlist: "BanlistStatusView | None" = None


class CardSuggestion(BaseModel):
    """One entry under the search box: enough to recognise the card and open it."""

    id: UUID
    name: str
    types: CardTypesView | None = None
    thumbnail_url: str | None = None


class NameView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    language: str
    name: str
    is_current: bool
    is_official: bool
    source_slug: str


class TextView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    language: str
    text: str
    pendulum_text: str | None
    is_official: bool
    source_slug: str
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


BanlistStatus = Literal["forbidden", "limited", "semi_limited", "unlimited", "unknown"]
Currency = Literal["EUR", "USD", "ARS", "BRL", "PYG", "UYU", "BOB"]
Condition = Literal["MT", "NM", "EX", "GD", "LP", "PL", "PO"]


class BanlistStatusView(BaseModel):
    """Status of one card on the list in force for a format, with its source."""

    format: Literal["TCG", "OCG"]
    effective_date: date
    status: BanlistStatus
    max_copies: int | None
    complete: bool
    source_name: str
    source_url: str
    scope_note: str | None = None


class BanlistListView(BaseModel):
    format: Literal["TCG", "OCG"]
    effective_date: date
    complete: bool
    source_name: str
    source_url: str
    retrieved_on: date
    scope_note: str | None
    counts: dict[str, int]


class PricePoint(BaseModel):
    printing_id: UUID
    code: str
    rarity: str
    language: str
    edition: str
    observed_at: datetime
    price: Decimal
    currency: Currency
    quantity: int
    condition: Condition | None


class PriceHistoryView(BaseModel):
    card_id: UUID
    market: Literal["TCG", "OCG"] | None
    printing_id: UUID | None
    days: int
    points: list[PricePoint]
    last_sale: PricePoint | None


class PriceObservationInput(BaseModel):
    printing_id: UUID
    price: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency: Currency
    observed_at: datetime
    quantity: int = Field(default=1, ge=1, le=999)
    condition: Condition | None = None
    source_reference: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_time(self):
        if self.observed_at.tzinfo is None:
            raise ValueError("observed_at debe incluir zona horaria")
        if self.observed_at > datetime.now(timezone.utc):
            raise ValueError("observed_at no puede estar en el futuro")
        return self


class CardDetail(CardSummary):
    artworks: list[ImageView] = []
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
    banlist_status: list[BanlistStatusView] = []
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
    # Cards of the catalogue printed in this set.
    card_count: int | None = None
    # The prefix of its printing codes ("BETB" in BETB-EN001), when one is common.
    code: str | None = None


class ArchetypeView(NamedView):
    card_count: int


class JobRequest(BaseModel):
    source: Literal["ygoprodeck", "yugipedia"]
    mode: Literal["initial", "incremental", "card", "images", "errata", "retry", "banlist"]
    identifier: str | None = Field(default=None, max_length=200)
    language: Literal["en", "es", "fr", "de", "it", "pt", "ja", "ko", "ae"] = "en"
    since: datetime | None = None
    retry_job_id: UUID | None = None
    max_cards: int = Field(default=3, ge=1, le=100000)
    # Keep only this many printings per card, each of a different rarity
    # (see app/ingestion/selection.py). None imports every printing.
    max_printings: int | None = Field(default=None, ge=1, le=50)
    banlist_format: Literal["TCG", "OCG"] | None = None
    effective_date: date | None = None

    @model_validator(mode="after")
    def validate_mode(self):
        if self.source == "ygoprodeck" and self.language not in {"en", "fr", "de", "it", "pt"}:
            raise ValueError("YGOPRODeck admite en, fr, de, it y pt; no inventar traducciones")
        if self.mode == "banlist":
            raise ValueError("La nueva fuente no documenta vigencia de banlists oficiales")
        if self.mode in {"card", "errata", "images"} and not self.identifier:
            raise ValueError("Este modo requiere identifier")
        if self.mode == "incremental" and self.source == "yugipedia" and not self.since:
            raise ValueError("Yugipedia incremental requiere since")
        if self.since and self.since.tzinfo is None:
            raise ValueError("since debe incluir zona horaria")
        if self.mode == "retry" and not self.retry_job_id:
            raise ValueError("retry requiere retry_job_id")
        if self.mode == "errata" and self.source != "yugipedia":
            raise ValueError("Las erratas documentadas se mantienen desde Yugipedia")
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


CardSummary.model_rebuild()
CardDetail.model_rebuild()
