"""Rarities stored under another spelling take their usual name.

"ScR", "Secret" or "Collectors Rare" become the name in app/services/rarities.py.

A rarity whose usual name is not stored yet is renamed. Otherwise its printings
move to the existing one, except a printing already stored there too (the same
card, code, language, edition and artwork): that one stays where it is, so no
price, image or wantlist entry is touched. Running it again changes nothing.

Revision ID: 011_canonical_rarities
Revises: 010_usage_counts
"""

import sqlalchemy as sa

from alembic import op
from app.services.rarities import canonical

revision = "011_canonical_rarities"
down_revision = "010_usage_counts"
branch_labels = None
depends_on = None

rarities = sa.table("rarities", sa.column("id", sa.Uuid()), sa.column("name", sa.String()))
printings = sa.table(
    "card_printings",
    *(sa.column(name) for name in ("card_id", "code", "language", "edition", "artwork")),
    sa.column("rarity_id", sa.Uuid()),
)
IDENTITY = ("card_id", "code", "language", "edition", "artwork")


def upgrade():
    bind = op.get_bind()
    stored = {name: rarity_id for rarity_id, name in bind.execute(sa.select(rarities))}
    for name, rarity_id in list(stored.items()):
        target = canonical(name)
        if target == name:
            continue
        if target not in stored:
            bind.execute(rarities.update().where(rarities.c.id == rarity_id).values(name=target))
            stored[target] = rarity_id
            continue
        twin = printings.alias("twin")
        already_there = sa.exists().where(
            twin.c.rarity_id == stored[target],
            *(twin.c[column] == printings.c[column] for column in IDENTITY),
        )
        bind.execute(
            printings.update()
            .where(printings.c.rarity_id == rarity_id, ~already_there)
            .values(rarity_id=stored[target])
        )
        left = bind.scalar(
            sa.select(sa.func.count())
            .select_from(printings)
            .where(printings.c.rarity_id == rarity_id)
        )
        if not left:
            bind.execute(rarities.delete().where(rarities.c.id == rarity_id))


def downgrade():
    # The old spellings were the same rarities; there is nothing to restore.
    pass
