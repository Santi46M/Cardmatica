from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.ingestion.normalizers import digest, normalized_name, rarity_name
from app.models import (
    Archetype,
    BanlistEntry,
    Card,
    CardArchetype,
    CardArtwork,
    CardErratum,
    CardImage,
    CardName,
    CardPrinting,
    CardRelation,
    CardSeries,
    CardSet,
    CardTextVersion,
    DataConflict,
    DataSource,
    FieldObservation,
    Rarity,
    Series,
    SourceReference,
)
from app.repositories.ingestion import ProvenanceRepository, aware, conflict, upsert
from app.schemas.ingestion import CardRecord, PrintingInput, TextInput
from app.services import card_types
from app.services.reconciliation import resolve_card

SOURCE_POLICIES = {
    "ygoprodeck": (80, "YGOPRODeck", "https://api.ygoprodeck.com/api-guide/"),
    "konami": (100, "Konami", "https://legal.konami.com/games/neuron/terms/tou/en/"),
    "yugipedia": (20, "Yugipedia", "https://yugipedia.com/wiki/Yugipedia:API"),
}


# How sure each source is about the card it describes.
VALIDATION = {
    "konami": "official_identifier",
    "ygoprodeck": "provider_identifier",
    "yugipedia": "community_identifier",
}
# Card fields a source may set; each is decided field by field.
CARD_FIELDS = (
    "passcode",
    "card_type",
    "subtypes",
    "attribute",
    "level",
    "rank",
    "link_rating",
    "atk",
    "defense",
    "pendulum_scale",
    "available_markets",
)
GROUP_MODELS = {
    "archetype": (Archetype, CardArchetype, "archetype_id"),
    "series": (Series, CardSeries, "series_id"),
}


class IngestionService:
    """Caller owns the transaction; a failed record never commits partial entities."""

    def __init__(self, session: Session):
        self.session = session

    def ingest(self, record: CardRecord) -> Card:
        """Store one card record from a source, keeping who said what.

        Each value goes through ProvenanceRepository.select_value, which decides
        by source authority whether it replaces what is stored. A record older
        than the one stored is ignored; one with the same content only updates
        when it was seen.
        """
        authority, name, policy = SOURCE_POLICIES[record.source]
        source = upsert(
            self.session,
            DataSource,
            {"slug": record.source, "name": name, "authority": authority, "policy_url": policy},
            ["slug"],
        )
        card = resolve_card(self.session, record, source)
        reference = self._reference(card, record, source)
        if reference is None:
            return card
        provenance = ProvenanceRepository(self.session, reference, source)
        self._card_fields(card, record, provenance)
        self._names(card, record, provenance)
        for printing in record.printings:
            self._printing(card, printing, provenance, record.source)
        if record.source == "ygoprodeck":
            self._artworks(card, record, provenance)
        self._groups(card, record, provenance)
        for text in record.texts:
            self._text(card, text, record.source == "konami", provenance)
        self._errata(card, record, provenance)
        self._relations(card, record, provenance)
        self._banlist(card, record, provenance)
        self._limitations(card, record)
        card.updated_at = utcnow()
        self.session.flush()
        return card

    def _reference(self, card, record, source):
        """The source's page for this card, updated; None when nothing new came."""
        content_hash = digest(record.model_dump(exclude={"fetched_at", "revision"}, mode="json"))
        reference = self.session.scalar(
            select(SourceReference).filter_by(
                source_id=source.id, external_id=record.external_id, language=record.language
            )
        )
        if reference and aware(reference.fetched_at) > record.fetched_at:
            return None
        if reference and reference.content_hash == content_hash:
            reference.fetched_at = record.fetched_at
            reference.revision = record.revision
            self._limitations(card, record)
            return None
        if not reference:
            reference = SourceReference(
                source_id=source.id,
                card_id=card.id,
                external_id=record.external_id,
                language=record.language,
                url=str(record.url),
                content_hash=content_hash,
            )
            self.session.add(reference)
        reference.fetched_at = record.fetched_at
        reference.content_hash = content_hash
        reference.revision = record.revision
        reference.url = str(record.url)
        reference.validation_status = VALIDATION[record.source]
        self.session.flush()
        return reference

    def _card_fields(self, card, record, provenance):
        key = f"card:{card.id}"
        for field in CARD_FIELDS:
            value = getattr(record, field)
            if provenance.select_value(key, field, value):
                setattr(card, field, value)
        card_types.apply(card)

    def _names(self, card, record, provenance):
        """Every name in every language; one current name per language."""
        key = f"card:{card.id}"
        official = record.source == "konami"
        for incoming in record.names:
            name_row = upsert(
                self.session,
                CardName,
                {
                    "card_id": card.id,
                    "language": incoming.language,
                    "name": incoming.name,
                    "normalized": normalized_name(incoming.name),
                    "is_current": False,
                    "is_official": official,
                    "source_slug": record.source,
                },
                ["card_id", "language", "name"],
            )
            if official:
                name_row.is_official = True
            if not incoming.current or not provenance.select_value(
                key, f"name:{incoming.language}", incoming.name
            ):
                continue
            self.session.execute(
                update(CardName)
                .where(
                    CardName.card_id == card.id,
                    CardName.language == incoming.language,
                    CardName.id != name_row.id,
                )
                .values(is_current=False)
            )
            name_row.is_current = True
            name_row.source_slug = record.source
            if provenance.select_value(key, "display_name", incoming.name):
                card.display_name = incoming.name

    def _artworks(self, card, record, provenance):
        """YGOPRODeck's general artworks. A new picture address drops the old
        download and its rights review, which belonged to the old picture."""
        for artwork in record.artworks:
            small = str(artwork.small_source_url) if artwork.small_source_url else None
            row = upsert(
                self.session,
                CardArtwork,
                {
                    "card_id": card.id,
                    "source_slug": record.source,
                    "external_id": artwork.external_id,
                    "source_url": str(artwork.source_url),
                    "small_source_url": small,
                    "rights_status": "unverified",
                },
                ["card_id", "source_slug", "external_id"],
            )
            if not provenance.select_value(
                f"artwork:{row.id}", "metadata", artwork.model_dump(mode="json")
            ):
                continue
            if row.source_url != str(artwork.source_url):
                row.local_path = row.thumbnail_path = row.sha256 = None
                row.rights_status = "unverified"
                row.authorization_reference = None
            row.source_url = str(artwork.source_url)
            row.small_source_url = small

    def _groups(self, card, record, provenance):
        """Archetypes and series. A source that sends the complete list also
        removes the links it no longer includes."""
        seen = set()
        for group in record.groups:
            group_model, link_model, column = GROUP_MODELS[group.kind]
            entity = upsert(self.session, group_model, {"name": group.name}, ["name"])
            link = upsert(
                self.session,
                link_model,
                {"card_id": card.id, column: entity.id, "relation": group.relation},
                ["card_id", column, "relation"],
            )
            provenance.select_value(
                f"{group.kind}_relation:{link.id}", "classification", group.model_dump()
            )
            seen.add((group.kind, link.id))
        snapshot = {"groups": [group.model_dump() for group in record.groups]}
        if record.groups_complete and provenance.select_value(
            f"card:{card.id}", "groups_snapshot", snapshot
        ):
            for kind, model in (("archetype", CardArchetype), ("series", CardSeries)):
                for link in self.session.scalars(select(model).where(model.card_id == card.id)):
                    if (kind, link.id) not in seen and provenance.select_value(
                        f"{kind}_relation:{link.id}", "classification", {"active": False}
                    ):
                        self.session.delete(link)
        if record.source == "ygoprodeck":
            self._retire_provider_archetypes(card, seen, provenance)

    def _errata(self, card, record, provenance):
        for erratum in record.errata:
            # Historical observations do not become official current text.
            old, new = (
                self._text(card, TextInput(language=erratum.language, text=text), False, provenance)
                if text
                else None
                for text in (erratum.old_text, erratum.new_text)
            )
            row = upsert(
                self.session,
                CardErratum,
                {
                    "card_id": card.id,
                    "external_key": f"{record.source}:{erratum.key}",
                    "language": erratum.language,
                    "old_text_id": old.id if old else None,
                    "new_text_id": new.id if new else None,
                    "explanation": erratum.explanation,
                    "effective_date": erratum.effective_date,
                    "classification": "official_documentation"
                    if record.source == "konami"
                    else "community_documentation",
                },
                ["card_id", "external_key"],
            )
            provenance.select_value(
                f"erratum:{row.id}",
                "documentation",
                erratum.model_dump(mode="json"),
                erratum.source_url,
            )

    def _relations(self, card, record, provenance):
        """Links to other cards by Konami id; one not in the catalogue is kept as a conflict."""
        for relation in record.relations:
            other = self.session.scalar(select(Card).where(Card.konami_id == relation.konami_id))
            if not other or other.id == card.id:
                conflict(self.session, record.source, "relation", relation.model_dump(), card.id)
                continue
            row = upsert(
                self.session,
                CardRelation,
                {"card_id": card.id, "related_card_id": other.id, "relation": relation.relation},
                ["card_id", "related_card_id", "relation"],
            )
            provenance.select_value(f"relation:{row.id}", "type", relation.relation)

    def _banlist(self, card, record, provenance):
        """Only Konami decides a card's status; other sources' claims stay as conflicts."""
        for entry in record.banlist:
            if record.source != "konami":
                conflict(
                    self.session, record.source, "banlist", entry.model_dump(mode="json"), card.id
                )
                continue
            row = upsert(
                self.session,
                BanlistEntry,
                {"card_id": card.id, **entry.model_dump(exclude={"source_url"})},
                ["card_id", "format", "effective_date"],
            )
            if provenance.select_value(
                f"banlist:{row.id}", "status", entry.status, entry.source_url
            ):
                row.status = entry.status

    def _limitations(self, card, record):
        if record.source == "ygoprodeck":
            for previous in self.session.scalars(
                select(DataConflict).where(
                    DataConflict.card_id == card.id,
                    DataConflict.source_slug == record.source,
                    DataConflict.field == "source_limitation",
                )
            ):
                previous.status = (
                    "open" if previous.details.get("message") in record.limitations else "resolved"
                )
        for limitation in record.limitations:
            row = conflict(
                self.session, record.source, "source_limitation", {"message": limitation}, card.id
            )
            row.status = "open"

    def _retire_provider_archetypes(self, card, seen, provenance):
        """Replace this provider's scalar membership, preserving other wiki groups."""
        for link in self.session.scalars(
            select(CardArchetype).where(CardArchetype.card_id == card.id)
        ):
            if ("archetype", link.id) in seen:
                continue
            key = f"archetype_relation:{link.id}"
            owned = self.session.scalar(
                select(FieldObservation.id)
                .join(SourceReference, FieldObservation.reference_id == SourceReference.id)
                .join(DataSource, SourceReference.source_id == DataSource.id)
                .where(
                    FieldObservation.entity_key == key,
                    FieldObservation.field == "classification",
                    FieldObservation.selected.is_(True),
                    DataSource.slug == "ygoprodeck",
                )
            )
            if owned and provenance.select_value(key, "classification", {"active": False}):
                self.session.delete(link)

    def _printing(self, card, incoming: PrintingInput, provenance, source):
        """A printing: its set, its rarity, the printing itself and its scans."""
        card_set = self._set(incoming, provenance)
        rarity = upsert(self.session, Rarity, {"name": rarity_name(incoming.rarity)}, ["name"])
        # What makes two printings different; the rest may change over time.
        identity = {
            "card_id": card.id,
            "code": incoming.code,
            "rarity_id": rarity.id,
            "language": incoming.language,
            "edition": incoming.edition,
            "artwork": incoming.artwork,
        }
        printing = upsert(
            self.session,
            CardPrinting,
            {
                **identity,
                "set_id": card_set.id,
                "market": incoming.market,
                "release_date": incoming.release_date,
            },
            list(identity),
        )
        key = f"printing:{printing.id}"
        released = incoming.release_date
        # field → (value as observed, value to store)
        changes = {
            "set_id": (str(card_set.id), card_set.id),
            "market": (incoming.market, incoming.market),
            "release_date": (released.isoformat() if released else None, released),
        }
        for field, (observed, value) in changes.items():
            if provenance.select_value(key, field, observed):
                setattr(printing, field, value)
        provenance.select_value(key, "identity", {k: str(v) for k, v in identity.items()})
        # A scan is never attached to an underspecified printing, nor taken
        # from a source other than Yugipedia.
        mappable = source == "yugipedia" and "unknown" not in (
            rarity.name.casefold(),
            incoming.artwork,
            incoming.edition,
        )
        for image in incoming.images:
            if mappable:
                self._scan(printing, image, provenance)
                continue
            conflict(
                self.session,
                source,
                "image_mapping",
                {
                    "code": incoming.code,
                    "image": str(image.source_url),
                    "reason": "Identidad de impresión insuficiente o fuente no admitida",
                },
                card.id,
            )

    def _set(self, incoming: PrintingInput, provenance):
        """The set of a printing, by its key in the source, language and market."""
        release_date = incoming.set_release_date or incoming.release_date
        card_set = upsert(
            self.session,
            CardSet,
            {
                "source_key": incoming.set_key,
                "name": incoming.set_name,
                "language": incoming.language,
                "market": incoming.market,
                "release_date": release_date,
                "product_type": incoming.product_type,
            },
            ["source_key", "language", "market"],
        )
        key = f"set:{card_set.id}"
        if provenance.select_value(key, "name", incoming.set_name):
            card_set.name = incoming.set_name
        if provenance.select_value(key, "product_type", incoming.product_type):
            card_set.product_type = incoming.product_type
        observed = release_date.isoformat() if release_date else release_date
        if provenance.select_value(key, "release_date", observed, incoming.set_source_url):
            card_set.release_date = release_date
        return card_set

    def _scan(self, printing, image, provenance):
        """A scan of a printing with its author and licence. An approved permission
        is kept when the source sends the same author and licence again unreviewed."""
        license_url = str(image.license_url) if image.license_url else None
        row = upsert(
            self.session,
            CardImage,
            {
                "printing_id": printing.id,
                "source_url": str(image.source_url),
                "file_title": image.file_title,
                "author": image.author,
                "license": image.license,
                "license_url": license_url,
                "rights_status": image.rights_status,
                "authorization_reference": image.authorization_reference,
            },
            ["printing_id", "source_url"],
        )
        if not provenance.select_value(
            f"image:{row.id}", "metadata", image.model_dump(mode="json")
        ):
            return
        keep_permission = (
            row.author == image.author
            and row.license == image.license
            and row.rights_status == "approved"
            and image.rights_status == "unverified"
            and not image.authorization_reference
        )
        row.author, row.license, row.license_url = image.author, image.license, license_url
        if not keep_permission:
            row.rights_status = image.rights_status
            row.authorization_reference = image.authorization_reference

    def _text(self, card, incoming: TextInput, official: bool, provenance):
        value_hash = digest([incoming.text, incoming.pendulum_text])
        row = upsert(
            self.session,
            CardTextVersion,
            {
                "card_id": card.id,
                "language": incoming.language,
                "text": incoming.text,
                "pendulum_text": incoming.pendulum_text,
                "content_hash": value_hash,
                "is_official": official,
                "source_slug": provenance.source.slug,
                "is_current": False,
                "valid_from": incoming.valid_from,
            },
            ["card_id", "language", "content_hash", "is_official", "source_slug"],
        )
        if (
            incoming.current
            and provenance.source.slug in {"konami", "ygoprodeck"}
            and provenance.select_value(
                f"card:{card.id}", f"official_text:{incoming.language}", value_hash
            )
        ):
            self.session.execute(
                update(CardTextVersion)
                .where(
                    CardTextVersion.card_id == card.id,
                    CardTextVersion.language == incoming.language,
                    CardTextVersion.source_slug.in_(["konami", "ygoprodeck"]),
                    CardTextVersion.id != row.id,
                )
                .values(is_current=False)
            )
            row.is_current = True
        provenance.select_value(
            f"text:{row.id}",
            "content",
            {
                "text": incoming.text,
                "pendulum_text": incoming.pendulum_text,
                "valid_from": incoming.valid_from.isoformat() if incoming.valid_from else None,
            },
        )
        return row
