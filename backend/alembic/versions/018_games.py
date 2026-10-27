"""Magic: The Gathering and Pokémon beside Yu-Gi-Oh!.

Every card and set says its game; what is stored until now is Yu-Gi-Oh!. Magic
and Pokémon cards are known by their source's identity (game_key), and carry
their own numbers (colours, mana value, HP) and what their card window shows
(details). Printings list their finishes (foil, reverse holo...). The markets
of the new games join TCG and OCG (app/core/games.py).

Revision ID: 018_games
Revises: 017_scans_only
"""

import sqlalchemy as sa

from alembic import op

revision = "018_games"
down_revision = "017_scans_only"
branch_labels = None
depends_on = None

MARKETS = "'TCG','OCG','MTG','PKM','PKMJ'"


def upgrade():
    op.add_column(
        "cards", sa.Column("game", sa.String(20), nullable=False, server_default="yugioh")
    )
    op.add_column("cards", sa.Column("game_key", sa.String(120), nullable=True))
    op.add_column("cards", sa.Column("colors", sa.JSON(), nullable=True))
    op.add_column("cards", sa.Column("mana_value", sa.Integer(), nullable=True))
    op.add_column("cards", sa.Column("hp", sa.Integer(), nullable=True))
    op.add_column("cards", sa.Column("details", sa.JSON(), nullable=True))
    op.create_unique_constraint(op.f("uq_cards_game_key"), "cards", ["game_key"])
    op.create_index("ix_cards_game_name", "cards", ["game", "display_name"])
    op.create_check_constraint(
        op.f("ck_cards_valid_game"), "cards", "game IN ('yugioh','magic','pokemon')"
    )
    op.add_column("sets", sa.Column("game", sa.String(20), nullable=False, server_default="yugioh"))
    op.create_index(op.f("ix_sets_game"), "sets", ["game"])
    op.add_column("card_printings", sa.Column("finishes", sa.JSON(), nullable=True))
    op.drop_constraint(op.f("ck_card_printings_valid_market"), "card_printings", type_="check")
    op.create_check_constraint(
        op.f("ck_card_printings_valid_market"), "card_printings", f"market IN ({MARKETS})"
    )


def downgrade():
    # Magic and Pokémon have no place in the older schema.
    op.execute("DELETE FROM cards WHERE game <> 'yugioh'")
    op.execute("DELETE FROM sets WHERE game <> 'yugioh'")
    op.drop_constraint(op.f("ck_card_printings_valid_market"), "card_printings", type_="check")
    op.create_check_constraint(
        op.f("ck_card_printings_valid_market"), "card_printings", "market IN ('TCG', 'OCG')"
    )
    op.drop_column("card_printings", "finishes")
    op.drop_index(op.f("ix_sets_game"), table_name="sets")
    op.drop_column("sets", "game")
    op.drop_constraint(op.f("ck_cards_valid_game"), "cards", type_="check")
    op.drop_index("ix_cards_game_name", table_name="cards")
    op.drop_constraint(op.f("uq_cards_game_key"), "cards", type_="unique")
    for column in ("details", "hp", "mana_value", "colors", "game_key", "game"):
        op.drop_column("cards", column)
