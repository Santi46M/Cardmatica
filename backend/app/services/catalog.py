from sqlalchemy import select

from app.core.config import get_settings
from app.models import (
    Archetype,
    BanlistEntry,
    CardArchetype,
    CardErratum,
    CardRelation,
    CardSeries,
    CardTextVersion,
    DataSource,
    FieldObservation,
    Series,
    SourceReference,
)
from app.schemas.catalog import (
    CardDetail,
    CardSummary,
    CardTypesView,
    ErratumView,
    FieldView,
    GroupView,
    ImageView,
    NameView,
    PrintingView,
    SourceView,
    TextView,
)
from app.services import rarities
from app.services.banlists import card_statuses
from app.services.card_types import normalize_kind


def image_view(image):
    approved = image.rights_status == "approved" and bool(image.authorization_reference)
    available = approved and bool(image.local_path)
    return ImageView(
        id=image.id,
        url=f"/api/v1/images/{image.id}" if available else None,
        thumbnail_url=f"/api/v1/images/{image.id}?thumbnail=true"
        if available and image.thumbnail_path
        else None,
        source_url=image.source_url,
        author=image.author,
        license=image.license,
        license_url=image.license_url,
        rights_status=image.rights_status,
        fallback_reason=None
        if available
        else "Imagen pendiente de descarga autorizada"
        if approved
        else "Derechos comerciales no verificados",
    )


def artwork_view(image):
    commercial = image.rights_status == "approved" and bool(image.authorization_reference)
    allowed = image.rights_status != "denied" and (commercial or get_settings().local_image_preview)
    available = allowed and bool(image.local_path)
    return ImageView(
        id=image.id,
        url=f"/api/v1/artworks/{image.id}" if available else None,
        thumbnail_url=f"/api/v1/artworks/{image.id}?thumbnail=true"
        if available and image.thumbnail_path
        else None,
        source_url=image.source_url,
        author=image.author,
        license=image.license,
        license_url=image.license_url,
        rights_status=image.rights_status,
        association="card_artwork",
        usage_scope="commercial_permission_verified" if commercial else "local_preview_only",
        fallback_reason=None
        if available
        else "Ilustración sin permiso comercial o sin descarga local",
    )


def printing_view(printing):
    rarity = rarities.info(printing.rarity.name)
    return PrintingView(
        id=printing.id,
        card_id=printing.card_id,
        code=printing.code,
        set_id=printing.set_id,
        set_name=printing.card_set.name,
        rarity=rarity.name,
        rarity_code=rarity.code,
        rarity_family=rarity.family,
        language=printing.language,
        market=printing.market,
        edition=printing.edition,
        artwork=printing.artwork,
        release_date=printing.release_date,
        images=[
            image_view(image) for image in sorted(printing.images, key=lambda value: str(value.id))
        ],
    )


def card_summary(card, language="es", market=None):
    names = sorted(
        (name for name in card.names if name.is_current),
        key=lambda name: (
            name.language != language,
            not name.is_official,
            name.language,
            name.name,
        ),
    )
    name = names[0] if names else None
    printings = [printing for printing in card.printings if not market or printing.market == market]
    images = [image_view(image) for printing in printings for image in printing.images]
    available = next((image for image in images if image.url), None)
    if available is None:
        available = next(
            (
                view
                for image in sorted(card.artworks, key=lambda row: row.external_id)
                if (view := artwork_view(image)).url
            ),
            None,
        )
    return CardSummary(
        id=card.id,
        konami_id=card.konami_id,
        ygoprodeck_id=card.ygoprodeck_id,
        name_source=name.source_slug if name else None,
        name=name.name if name else card.display_name,
        name_is_official=bool(name and name.is_official),
        card_type=card.card_type,
        subtypes=card.subtypes,
        attribute=card.attribute,
        types=CardTypesView(
            kind=normalize_kind(card.card_type),
            frame=card.monster_frame,
            pendulum=bool(card.is_pendulum),
            abilities=card.monster_abilities or [],
            race=card.monster_race,
            property=card.card_property,
            attribute=card.attribute,
            level=card.level,
            rank=card.rank,
            link_rating=card.link_rating,
        ),
        markets=sorted(
            set(card.available_markets) | {printing.market for printing in card.printings}
        ),
        printing_count=len(printings),
        image=available,
        updated_at=card.updated_at,
    )


def errata_views(session, card_id):
    rows = session.scalars(
        select(CardErratum)
        .where(CardErratum.card_id == card_id)
        .order_by(CardErratum.effective_date.desc().nullslast(), CardErratum.id)
    ).all()
    ids = {
        identifier
        for row in rows
        for identifier in (row.old_text_id, row.new_text_id)
        if identifier
    }
    texts = (
        {
            text.id: TextView.model_validate(text)
            for text in session.scalars(select(CardTextVersion).where(CardTextVersion.id.in_(ids)))
        }
        if ids
        else {}
    )
    return [
        ErratumView(
            id=row.id,
            language=row.language,
            explanation=row.explanation,
            effective_date=row.effective_date,
            classification=row.classification,
            old_text=texts.get(row.old_text_id),
            new_text=texts.get(row.new_text_id),
        )
        for row in rows
    ]


def card_detail(session, card, language="es"):
    def groups(model, link, column):
        rows = session.execute(
            select(model, link.relation)
            .join(link, getattr(link, column) == model.id)
            .where(link.card_id == card.id)
            .order_by(model.name)
        ).all()
        return [
            GroupView(id=group.id, name=group.name, relation=relation) for group, relation in rows
        ]

    sources = session.execute(
        select(SourceReference, DataSource.slug)
        .join(DataSource)
        .where(SourceReference.card_id == card.id)
    ).all()
    observations = session.execute(
        select(FieldObservation, DataSource.slug)
        .join(SourceReference, FieldObservation.reference_id == SourceReference.id)
        .join(DataSource, SourceReference.source_id == DataSource.id)
        .where(SourceReference.card_id == card.id, FieldObservation.selected.is_(True))
    ).all()
    return CardDetail(
        **card_summary(card, language).model_dump(),
        artworks=[artwork_view(image) for image in card.artworks],
        passcode=card.passcode,
        names=[NameView.model_validate(name) for name in card.names],
        level=card.level,
        rank=card.rank,
        link_rating=card.link_rating,
        atk=card.atk,
        defense=card.defense,
        pendulum_scale=card.pendulum_scale,
        texts=[
            TextView.model_validate(text)
            for text in session.scalars(
                select(CardTextVersion)
                .where(CardTextVersion.card_id == card.id)
                .order_by(
                    CardTextVersion.language,
                    CardTextVersion.is_current.desc(),
                    CardTextVersion.created_at.desc(),
                )
            )
        ],
        archetypes=groups(Archetype, CardArchetype, "archetype_id"),
        series=groups(Series, CardSeries, "series_id"),
        sources=[
            SourceView(
                source=slug,
                url=reference.url,
                fetched_at=reference.fetched_at,
                validation_status=reference.validation_status,
            )
            for reference, slug in sources
        ],
        provenance=[
            FieldView(
                entity=observation.entity_key,
                field=observation.field,
                source=slug,
                observed_at=observation.observed_at,
                status=observation.status,
                source_url=observation.source_url,
            )
            for observation, slug in observations
        ],
        errata=errata_views(session, card.id),
        banlist=[
            {"format": row.format, "effective_date": row.effective_date, "status": row.status}
            for row in session.scalars(
                select(BanlistEntry)
                .where(BanlistEntry.card_id == card.id)
                .order_by(BanlistEntry.effective_date.desc())
            )
        ],
        banlist_status=card_statuses(session, card),
        relations=[
            {"card_id": row.related_card_id, "relation": row.relation}
            for row in session.scalars(select(CardRelation).where(CardRelation.card_id == card.id))
        ],
    )
