from datetime import date
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.games import DEFAULT_GAME, GAMES, MARKETS, sql_list
from app.db.base import Base, Entity


class Card(Entity, Base):
    __tablename__ = "cards"
    __table_args__ = (
        CheckConstraint("konami_id IS NULL OR konami_id > 0", name="positive_konami_id"),
        Index("ix_cards_type_name", "card_type", "display_name"),
        Index("ix_cards_frame", "card_type", "monster_frame"),
        Index("ix_cards_property", "card_type", "card_property"),
        Index("ix_cards_race", "monster_race"),
        Index("ix_cards_attribute", "attribute"),
        Index("ix_cards_game_name", "game", "display_name"),
        CheckConstraint(f"game IN ({sql_list(GAMES)})", name="valid_game"),
    )
    # Which card game (app/core/games.py). Magic and Pokémon cards are known by
    # their source's own identity (game_key): Scryfall's oracle id, TCGdex's card id.
    game: Mapped[str] = mapped_column(String(20), default=DEFAULT_GAME, server_default=DEFAULT_GAME)
    game_key: Mapped[str | None] = mapped_column(String(120), unique=True)
    konami_id: Mapped[int | None] = mapped_column(Integer, unique=True)
    ygoprodeck_id: Mapped[int | None] = mapped_column(Integer, unique=True)
    available_markets: Mapped[list] = mapped_column(JSON, default=list)
    passcode: Mapped[str | None] = mapped_column(String(8), index=True)
    display_name: Mapped[str] = mapped_column(String(300), index=True)
    card_type: Mapped[str | None] = mapped_column(String(30))
    subtypes: Mapped[list] = mapped_column(JSON, default=list)
    attribute: Mapped[str | None] = mapped_column(String(30))
    level: Mapped[int | None] = mapped_column(Integer)
    rank: Mapped[int | None] = mapped_column(Integer)
    link_rating: Mapped[int | None] = mapped_column(Integer)
    atk: Mapped[str | None] = mapped_column(String(20))
    defense: Mapped[str | None] = mapped_column(String(20))
    pendulum_scale: Mapped[int | None] = mapped_column(Integer)
    # Type levels derived from card_type + subtypes (app/services/card_types.py),
    # stored so the catalogue can filter and sort by them with an index.
    monster_frame: Mapped[str | None] = mapped_column(String(20))
    is_pendulum: Mapped[bool] = mapped_column(Boolean, default=False)
    monster_abilities: Mapped[list | None] = mapped_column(JSON, default=list)
    monster_race: Mapped[str | None] = mapped_column(String(40))
    card_property: Mapped[str | None] = mapped_column(String(20))
    # Magic: colours (W, U, B, R, G) and mana value. Pokémon: energy types and HP.
    colors: Mapped[list | None] = mapped_column(JSON, default=list)
    mana_value: Mapped[int | None] = mapped_column(Integer)
    hp: Mapped[int | None] = mapped_column(Integer)
    # What the card window shows for that game: mana cost, power and toughness,
    # attacks, weakness, retreat, regulation mark, legal formats (shown, never filtered).
    details: Mapped[dict | None] = mapped_column(JSON, default=dict)
    names: Mapped[list["CardName"]] = relationship(
        back_populates="card", cascade="all, delete-orphan"
    )
    printings: Mapped[list["CardPrinting"]] = relationship(back_populates="card")
    artworks: Mapped[list["CardArtwork"]] = relationship(back_populates="card")


class CardName(Entity, Base):
    __tablename__ = "card_names"
    __table_args__ = (UniqueConstraint("card_id", "language", "name"),)
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    language: Mapped[str] = mapped_column(String(12))
    name: Mapped[str] = mapped_column(String(300), index=True)
    normalized: Mapped[str] = mapped_column(String(300), index=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    is_official: Mapped[bool] = mapped_column(Boolean, default=False)
    source_slug: Mapped[str] = mapped_column(String(30), default="yugipedia")
    card: Mapped[Card] = relationship(back_populates="names")


class Archetype(Entity, Base):
    __tablename__ = "archetypes"
    name: Mapped[str] = mapped_column(String(200), unique=True)


class CardArchetype(Entity, Base):
    __tablename__ = "card_archetypes"
    __table_args__ = (UniqueConstraint("card_id", "archetype_id", "relation"),)
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    archetype_id: Mapped[UUID] = mapped_column(ForeignKey("archetypes.id"), index=True)
    relation: Mapped[str] = mapped_column(String(30), default="member")


class Series(Entity, Base):
    __tablename__ = "series"
    name: Mapped[str] = mapped_column(String(200), unique=True)


class CardSeries(Entity, Base):
    __tablename__ = "card_series"
    __table_args__ = (UniqueConstraint("card_id", "series_id", "relation"),)
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    series_id: Mapped[UUID] = mapped_column(ForeignKey("series.id"), index=True)
    relation: Mapped[str] = mapped_column(String(30), default="member")


class CardSet(Entity, Base):
    __tablename__ = "sets"
    __table_args__ = (UniqueConstraint("source_key", "language", "market"),)
    game: Mapped[str] = mapped_column(
        String(20), default=DEFAULT_GAME, server_default=DEFAULT_GAME, index=True
    )
    source_key: Mapped[str] = mapped_column(String(200))
    name: Mapped[str] = mapped_column(String(300), index=True)
    language: Mapped[str] = mapped_column(String(12))
    market: Mapped[str] = mapped_column(String(8))
    product_type: Mapped[str | None] = mapped_column(String(60))
    release_date: Mapped[date | None] = mapped_column(Date)


class Rarity(Entity, Base):
    __tablename__ = "rarities"
    name: Mapped[str] = mapped_column(String(100), unique=True)


class CardPrinting(Entity, Base):
    __tablename__ = "card_printings"
    __table_args__ = (
        UniqueConstraint("card_id", "code", "rarity_id", "language", "edition", "artwork"),
        CheckConstraint(f"market IN ({sql_list(MARKETS)})", name="valid_market"),
        Index("ix_printings_market_code", "market", "code"),
    )
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    set_id: Mapped[UUID] = mapped_column(ForeignKey("sets.id"), index=True)
    rarity_id: Mapped[UUID] = mapped_column(ForeignKey("rarities.id"), index=True)
    code: Mapped[str] = mapped_column(String(80), index=True)
    language: Mapped[str] = mapped_column(String(12))
    market: Mapped[str] = mapped_column(String(8))
    edition: Mapped[str] = mapped_column(String(80), default="unknown")
    artwork: Mapped[str] = mapped_column(String(120), default="unknown")
    release_date: Mapped[date | None] = mapped_column(Date)
    # Finishes the printing exists in, sold as one product: Magic nonfoil, foil,
    # etched; Pokémon normal, holo, reverse, firstEdition. Empty for Yu-Gi-Oh!.
    finishes: Mapped[list | None] = mapped_column(JSON, default=list)
    card: Mapped[Card] = relationship(back_populates="printings")
    card_set: Mapped[CardSet] = relationship()
    rarity: Mapped[Rarity] = relationship()
    images: Mapped[list["CardImage"]] = relationship(back_populates="printing")


class CardImage(Entity, Base):
    """Scan of one specific printing (set, code, rarity, language and edition).

    The most specific picture of a printing; without one, the catalogue shows the
    card's general artwork with the printing's rarity drawn over it. Photos that
    sellers attach to their own listings are kept apart, with each listing.
    """

    __tablename__ = "card_images"
    __table_args__ = (
        UniqueConstraint("printing_id", "source_url"),
        # A new source of printing scans is added here once its terms allow it.
        CheckConstraint("source_slug IN ('yugipedia')", name="valid_image_source"),
    )
    printing_id: Mapped[UUID] = mapped_column(ForeignKey("card_printings.id"), index=True)
    source_slug: Mapped[str] = mapped_column(String(20), default="yugipedia")
    source_url: Mapped[str] = mapped_column(Text)
    file_title: Mapped[str] = mapped_column(String(300))
    author: Mapped[str | None] = mapped_column(Text)
    license: Mapped[str | None] = mapped_column(Text)
    license_url: Mapped[str | None] = mapped_column(Text)
    rights_status: Mapped[str] = mapped_column(String(30), default="unverified")
    authorization_reference: Mapped[str | None] = mapped_column(Text)
    local_path: Mapped[str | None] = mapped_column(String(300))
    thumbnail_path: Mapped[str | None] = mapped_column(String(300))
    sha256: Mapped[str | None] = mapped_column(String(64))
    printing: Mapped[CardPrinting] = relationship(back_populates="images")


class CardArtwork(Entity, Base):
    """General illustrations, deliberately separate from printing scans."""

    __tablename__ = "card_artworks"
    __table_args__ = (UniqueConstraint("card_id", "source_slug", "external_id"),)
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    source_slug: Mapped[str] = mapped_column(String(30))
    external_id: Mapped[str] = mapped_column(String(100))
    source_url: Mapped[str] = mapped_column(Text)
    small_source_url: Mapped[str | None] = mapped_column(Text)
    author: Mapped[str | None] = mapped_column(Text)
    license: Mapped[str | None] = mapped_column(Text)
    license_url: Mapped[str | None] = mapped_column(Text)
    rights_status: Mapped[str] = mapped_column(String(30), default="unverified")
    authorization_reference: Mapped[str | None] = mapped_column(Text)
    local_path: Mapped[str | None] = mapped_column(String(300))
    thumbnail_path: Mapped[str | None] = mapped_column(String(300))
    sha256: Mapped[str | None] = mapped_column(String(64))
    card: Mapped[Card] = relationship(back_populates="artworks")


class CardTextVersion(Entity, Base):
    __tablename__ = "card_text_versions"
    __table_args__ = (
        UniqueConstraint("card_id", "language", "content_hash", "is_official", "source_slug"),
    )
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    language: Mapped[str] = mapped_column(String(12))
    text: Mapped[str] = mapped_column(Text)
    pendulum_text: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    is_official: Mapped[bool] = mapped_column(Boolean)
    source_slug: Mapped[str] = mapped_column(String(30), default="yugipedia")
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)
    valid_from: Mapped[date | None] = mapped_column(Date)
    printing_id: Mapped[UUID | None] = mapped_column(ForeignKey("card_printings.id"))


class CardErratum(Entity, Base):
    __tablename__ = "card_errata"
    __table_args__ = (UniqueConstraint("card_id", "external_key"),)
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    external_key: Mapped[str] = mapped_column(String(200))
    language: Mapped[str] = mapped_column(String(12))
    old_text_id: Mapped[UUID | None] = mapped_column(ForeignKey("card_text_versions.id"))
    new_text_id: Mapped[UUID | None] = mapped_column(ForeignKey("card_text_versions.id"))
    explanation: Mapped[str] = mapped_column(Text)
    effective_date: Mapped[date | None] = mapped_column(Date)
    classification: Mapped[str] = mapped_column(String(40), default="community_documentation")


class CardRelation(Entity, Base):
    __tablename__ = "card_relations"
    __table_args__ = (UniqueConstraint("card_id", "related_card_id", "relation"),)
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    related_card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id"), index=True)
    relation: Mapped[str] = mapped_column(String(80))


class BanlistEntry(Entity, Base):
    __tablename__ = "banlist_entries"
    __table_args__ = (
        UniqueConstraint("card_id", "format", "effective_date"),
        CheckConstraint(
            "status IN ('forbidden','limited','semi_limited','unlimited')", name="valid_status"
        ),
    )
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    format: Mapped[str] = mapped_column(String(60), index=True)
    effective_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20))


class BanlistList(Entity, Base):
    """A dated Forbidden & Limited List as published, with its provenance.

    Entries are kept by English card name so cards synchronised after the import
    resolve their status without re-importing. A complete list means every card
    not named on it is unlimited for that format and date.
    """

    __tablename__ = "banlist_lists"
    __table_args__ = (
        UniqueConstraint("format", "effective_date"),
        CheckConstraint("format IN ('TCG', 'OCG')", name="valid_format"),
    )
    format: Mapped[str] = mapped_column(String(8))
    effective_date: Mapped[date] = mapped_column(Date)
    complete: Mapped[bool] = mapped_column(Boolean, default=False)
    source_name: Mapped[str] = mapped_column(String(200))
    source_url: Mapped[str] = mapped_column(Text)
    retrieved_on: Mapped[date] = mapped_column(Date)
    scope_note: Mapped[str | None] = mapped_column(Text)
    entries: Mapped[list["BanlistListEntry"]] = relationship(
        back_populates="banlist", cascade="all, delete-orphan"
    )


class BanlistListEntry(Entity, Base):
    __tablename__ = "banlist_list_entries"
    __table_args__ = (
        UniqueConstraint("banlist_id", "normalized_name"),
        CheckConstraint(
            "status IN ('forbidden','limited','semi_limited')", name="valid_list_status"
        ),
    )
    banlist_id: Mapped[UUID] = mapped_column(
        ForeignKey("banlist_lists.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(300))
    normalized_name: Mapped[str] = mapped_column(String(300), index=True)
    status: Mapped[str] = mapped_column(String(20))
    banlist: Mapped[BanlistList] = relationship(back_populates="entries")


# Substring searches use PostgreSQL trigram indexes; SQLite is only a test adapter.
for entity, column in (
    (CardName, "name"),
    (CardSet, "name"),
    (Rarity, "name"),
    (Archetype, "name"),
    (CardPrinting, "code"),
):
    Index(
        f"ix_{entity.__tablename__}_{column}_trgm",
        entity.__table__.c[column],
        postgresql_using="gin",
        postgresql_ops={column: "gin_trgm_ops"},
    ).ddl_if(dialect="postgresql")

Index(
    "uq_current_official_text",
    CardTextVersion.card_id,
    CardTextVersion.language,
    unique=True,
    postgresql_where=CardTextVersion.is_current & CardTextVersion.is_official,
).ddl_if(dialect="postgresql")
