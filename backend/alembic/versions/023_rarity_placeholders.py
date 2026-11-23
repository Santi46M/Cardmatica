"""Printings stored with a value that is not a rarity ("2", "3", "New").

YGOPRODeck sent those for a few printings. Each one takes its documented rarity
(app/integrations/ygoprodeck/corrections.py) or else Unknown ("Sin
documentar"), the same thing the importer now does. A printing already stored
with that rarity too stays where it is, so nothing that points at it changes
(as in 011_canonical_rarities). Running it again changes nothing.

Revision ID: 023_rarity_placeholders
Revises: 022_listing_photos
"""

import uuid
from datetime import datetime, timezone

import sqlalchemy as sa

from alembic import op
from app.integrations.ygoprodeck.corrections import RARITIES
from app.services.rarities import UNKNOWN, canonical

revision = "023_rarity_placeholders"
down_revision = "022_listing_photos"
branch_labels = None
depends_on = None

rarities = sa.table(
    "rarities",
    sa.column("id", sa.Uuid()),
    sa.column("name", sa.String()),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)
IDENTITY = ("card_id", "code", "language", "edition", "artwork")
printings = sa.table(
    "card_printings",
    sa.column("id", sa.Uuid()),
    *(sa.column(name) for name in IDENTITY),
    sa.column("rarity_id", sa.Uuid()),
)


def rarity_id(bind, name):
    found = bind.scalar(sa.select(rarities.c.id).where(rarities.c.name == name))
    if found:
        return found
    # Ids and times are made by the application (app/db/base.py), not the database.
    new, now = uuid.uuid4(), datetime.now(timezone.utc)
    bind.execute(rarities.insert().values(id=new, name=name, created_at=now, updated_at=now))
    return new


def upgrade():
    bind = op.get_bind()
    wrong = [
        (rarity, name)
        for rarity, name in bind.execute(sa.select(rarities.c.id, rarities.c.name))
        if name != UNKNOWN and canonical(name) == UNKNOWN
    ]
    for wrong_id, _ in wrong:
        rows = bind.execute(
            sa.select(printings.c.id, *(printings.c[column] for column in IDENTITY)).where(
                printings.c.rarity_id == wrong_id
            )
        ).all()
        for row in rows:
            target = rarity_id(bind, RARITIES.get(row.code, (UNKNOWN,))[0])
            twin = bind.scalar(
                sa.select(sa.func.count())
                .select_from(printings)
                .where(
                    printings.c.rarity_id == target,
                    *(printings.c[column] == getattr(row, column) for column in IDENTITY),
                )
            )
            if not twin:
                bind.execute(
                    printings.update().where(printings.c.id == row.id).values(rarity_id=target)
                )
        left = bind.scalar(
            sa.select(sa.func.count())
            .select_from(printings)
            .where(printings.c.rarity_id == wrong_id)
        )
        if not left:
            bind.execute(rarities.delete().where(rarities.c.id == wrong_id))


def downgrade():
    # The old values were not rarities; there is nothing to restore.
    pass
