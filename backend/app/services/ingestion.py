from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.ingestion.normalizers import digest, normalized_name, rarity_name
from app.models import (
    Archetype,
    BanlistEntry,
    Card,
    CardArchetype,
    CardErratum,
    CardImage,
    CardName,
    CardPrinting,
    CardRelation,
    CardSeries,
    CardSet,
    CardTextVersion,
    DataSource,
    Rarity,
    Series,
    SourceReference,
)
from app.repositories.ingestion import ProvenanceRepository, aware, conflict, upsert
from app.schemas.ingestion import CardRecord, PrintingInput, TextInput
from app.services.reconciliation import resolve_card

SOURCE_POLICIES = {
    "konami": (100, "Konami", "https://legal.konami.com/games/neuron/terms/tou/en/"),
    "yugipedia": (20, "Yugipedia", "https://yugipedia.com/wiki/Yugipedia:API"),
}


class IngestionService:
    """Caller owns the transaction; a failed record never commits partial entities."""

    def __init__(self, session: Session):
        self.session = session

    def ingest(self, record: CardRecord) -> Card:
        authority, name, policy = SOURCE_POLICIES[record.source]
        source = upsert(
            self.session,
            DataSource,
            {"slug": record.source, "name": name, "authority": authority, "policy_url": policy},
            ["slug"],
        )
        card = resolve_card(self.session, record, source)
        content_hash = digest(record.model_dump(exclude={"fetched_at", "revision"}, mode="json"))
        reference = self.session.scalar(
            select(SourceReference).filter_by(
                source_id=source.id, external_id=record.external_id, language=record.language
            )
        )
        if reference and (
            aware(reference.fetched_at) > record.fetched_at
            or reference.content_hash == content_hash
        ):
            return card
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
        reference.validation_status = (
            "official_identifier" if record.source == "konami" else "community_identifier"
        )
        self.session.flush()
        provenance = ProvenanceRepository(self.session, reference, source)
        key = f"card:{card.id}"
        for field in (
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
        ):
            value = getattr(record, field)
            if provenance.select_value(key, field, value):
                setattr(card, field, value)
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
                    "is_official": record.source == "konami",
                },
                ["card_id", "language", "name"],
            )
            if record.source == "konami":
                name_row.is_official = True
            if incoming.current and provenance.select_value(
                key, f"name:{incoming.language}", incoming.name
            ):
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
                if provenance.select_value(key, "display_name", incoming.name):
                    card.display_name = incoming.name
        for printing in record.printings:
            self._printing(card, printing, provenance, record.source)
        seen_groups = set()
        for group in record.groups:
            group_model, link_model, column = (
                (Archetype, CardArchetype, "archetype_id")
                if group.kind == "archetype"
                else (Series, CardSeries, "series_id")
            )
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
            seen_groups.add((group.kind, link.id))
        if record.groups_complete and provenance.select_value(
            key, "groups_snapshot", {"groups": [group.model_dump() for group in record.groups]}
        ):
            for kind, model in (("archetype", CardArchetype), ("series", CardSeries)):
                for link in self.session.scalars(select(model).where(model.card_id == card.id)):
                    if (kind, link.id) not in seen_groups and provenance.select_value(
                        f"{kind}_relation:{link.id}", "classification", {"active": False}
                    ):
                        self.session.delete(link)
        for text in record.texts:
            self._text(card, text, record.source == "konami", provenance)
        for erratum in record.errata:
            # Historical observations do not become official current text.
            old = (
                self._text(
                    card,
                    TextInput(language=erratum.language, text=erratum.old_text),
                    False,
                    provenance,
                )
                if erratum.old_text
                else None
            )
            new = (
                self._text(
                    card,
                    TextInput(language=erratum.language, text=erratum.new_text),
                    False,
                    provenance,
                )
                if erratum.new_text
                else None
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
        for relation in record.relations:
            other = self.session.scalar(select(Card).where(Card.konami_id == relation.konami_id))
            if other and other.id != card.id:
                row = upsert(
                    self.session,
                    CardRelation,
                    {
                        "card_id": card.id,
                        "related_card_id": other.id,
                        "relation": relation.relation,
                    },
                    ["card_id", "related_card_id", "relation"],
                )
                provenance.select_value(f"relation:{row.id}", "type", relation.relation)
            else:
                conflict(self.session, record.source, "relation", relation.model_dump(), card.id)
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
        for limitation in record.limitations:
            conflict(
                self.session, record.source, "source_limitation", {"message": limitation}, card.id
            )
        card.updated_at = utcnow()
        self.session.flush()
        return card

    def _printing(self, card, incoming: PrintingInput, provenance, source):
        card_set = upsert(
            self.session,
            CardSet,
            {
                "source_key": incoming.set_key,
                "name": incoming.set_name,
                "language": incoming.language,
                "market": incoming.market,
                "release_date": incoming.release_date,
                "product_type": incoming.product_type,
            },
            ["source_key", "language", "market"],
        )
        rarity = upsert(self.session, Rarity, {"name": rarity_name(incoming.rarity)}, ["name"])
        for field in ("name", "product_type", "release_date"):
            value = incoming.set_name if field == "name" else getattr(incoming, field)
            encoded = value.isoformat() if field == "release_date" and value else value
            if provenance.select_value(f"set:{card_set.id}", field, encoded):
                setattr(card_set, field, value)
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
        for field, value in {
            "set_id": str(card_set.id),
            "market": incoming.market,
            "release_date": incoming.release_date.isoformat() if incoming.release_date else None,
        }.items():
            if provenance.select_value(key, field, value):
                setattr(
                    printing,
                    field,
                    card_set.id
                    if field == "set_id"
                    else incoming.release_date
                    if field == "release_date"
                    else value,
                )
        provenance.select_value(key, "identity", {k: str(v) for k, v in identity.items()})
        for image in incoming.images:
            # A generic card illustration is never attached to an underspecified printing.
            if (
                source != "yugipedia"
                or rarity.name.casefold() == "unknown"
                or incoming.artwork == "unknown"
                or incoming.edition == "unknown"
            ):
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
                continue
            row = upsert(
                self.session,
                CardImage,
                {
                    "printing_id": printing.id,
                    "source_url": str(image.source_url),
                    "file_title": image.file_title,
                    "author": image.author,
                    "license": image.license,
                    "license_url": str(image.license_url) if image.license_url else None,
                    "rights_status": image.rights_status,
                    "authorization_reference": image.authorization_reference,
                },
                ["printing_id", "source_url"],
            )
            if provenance.select_value(
                f"image:{row.id}", "metadata", image.model_dump(mode="json")
            ):
                same_metadata = row.author == image.author and row.license == image.license
                preserve_permission = (
                    same_metadata
                    and row.rights_status == "approved"
                    and image.rights_status == "unverified"
                    and not image.authorization_reference
                )
                for field in ("author", "license"):
                    setattr(row, field, getattr(image, field))
                row.license_url = str(image.license_url) if image.license_url else None
                if not preserve_permission:
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
                "is_current": False,
                "valid_from": incoming.valid_from,
            },
            ["card_id", "language", "content_hash", "is_official"],
        )
        if (
            incoming.current
            and official
            and provenance.select_value(
                f"card:{card.id}", f"official_text:{incoming.language}", value_hash
            )
        ):
            self.session.execute(
                update(CardTextVersion)
                .where(
                    CardTextVersion.card_id == card.id,
                    CardTextVersion.language == incoming.language,
                    CardTextVersion.is_official.is_(True),
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
