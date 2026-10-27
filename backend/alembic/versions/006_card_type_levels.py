"""Card type levels: monster frame, Pendulum, abilities, race and spell/trap property.

Derived from card_type + subtypes by app/services/card_types.py and filled in
for the cards already stored.

Revision ID: 006_card_type_levels
Revises: 005_banlists_prices
"""

import sqlalchemy as sa

from alembic import op
from app.services.card_types import classify

revision = "006_card_type_levels"
down_revision = "005_banlists_prices"
branch_labels = None
depends_on = None

BATCH = 500


def upgrade():
    with op.batch_alter_table("cards") as table:
        table.add_column(sa.Column("monster_frame", sa.String(20)))
        table.add_column(
            sa.Column("is_pendulum", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        table.add_column(sa.Column("monster_abilities", sa.JSON(), nullable=True))
        table.add_column(sa.Column("monster_race", sa.String(40)))
        table.add_column(sa.Column("card_property", sa.String(20)))
    op.create_index("ix_cards_frame", "cards", ["card_type", "monster_frame"])
    op.create_index("ix_cards_property", "cards", ["card_type", "card_property"])
    op.create_index("ix_cards_race", "cards", ["monster_race"])
    op.create_index("ix_cards_attribute", "cards", ["attribute"])

    connection = op.get_bind()
    cards = sa.table(
        "cards",
        sa.column("id", sa.Uuid()),
        sa.column("card_type", sa.String()),
        sa.column("subtypes", sa.JSON()),
        sa.column("monster_frame", sa.String()),
        sa.column("is_pendulum", sa.Boolean()),
        sa.column("monster_abilities", sa.JSON()),
        sa.column("monster_race", sa.String()),
        sa.column("card_property", sa.String()),
    )
    rows = connection.execute(sa.select(cards.c.id, cards.c.card_type, cards.c.subtypes)).all()
    for start in range(0, len(rows), BATCH):
        for row in rows[start : start + BATCH]:
            types = classify(row.card_type, row.subtypes)
            connection.execute(
                cards.update()
                .where(cards.c.id == row.id)
                .values(
                    monster_frame=types.frame,
                    is_pendulum=types.pendulum,
                    monster_abilities=types.abilities,
                    monster_race=types.race,
                    card_property=types.property,
                )
            )


def downgrade():
    for name in ["ix_cards_attribute", "ix_cards_race", "ix_cards_property", "ix_cards_frame"]:
        op.drop_index(name, table_name="cards")
    with op.batch_alter_table("cards") as table:
        for column in [
            "card_property",
            "monster_race",
            "monster_abilities",
            "is_pendulum",
            "monster_frame",
        ]:
            table.drop_column(column)
