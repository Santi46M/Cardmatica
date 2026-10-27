"""Dated Forbidden & Limited Lists with provenance and storefront sale prices.

Revision ID: 005_banlists_prices
Revises: 004_name_source
"""

import sqlalchemy as sa

from alembic import op

revision = "005_banlists_prices"
down_revision = "004_name_source"
branch_labels = None
depends_on = None


def timestamps():
    return [
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade():
    op.create_table(
        "banlist_lists",
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_banlist_lists")),
        sa.Column("format", sa.String(8), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("complete", sa.Boolean(), nullable=False),
        sa.Column("source_name", sa.String(200), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("retrieved_on", sa.Date(), nullable=False),
        sa.Column("scope_note", sa.Text()),
        sa.UniqueConstraint("format", "effective_date", name=op.f("uq_banlist_lists_format")),
        sa.CheckConstraint("format IN ('TCG', 'OCG')", name=op.f("ck_banlist_lists_valid_format")),
    )
    op.create_table(
        "banlist_list_entries",
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_banlist_list_entries")),
        sa.Column(
            "banlist_id",
            sa.Uuid(),
            sa.ForeignKey(
                "banlist_lists.id",
                ondelete="CASCADE",
                name=op.f("fk_banlist_list_entries_banlist_id_banlist_lists"),
            ),
            nullable=False,
        ),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("normalized_name", sa.String(300), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.UniqueConstraint(
            "banlist_id", "normalized_name", name=op.f("uq_banlist_list_entries_banlist_id")
        ),
        sa.CheckConstraint(
            "status IN ('forbidden','limited','semi_limited')",
            name=op.f("ck_banlist_list_entries_valid_list_status"),
        ),
    )
    op.create_index("ix_banlist_list_entries_banlist_id", "banlist_list_entries", ["banlist_id"])
    op.create_index(
        "ix_banlist_list_entries_normalized_name", "banlist_list_entries", ["normalized_name"]
    )
    op.create_table(
        "price_observations",
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_price_observations")),
        sa.Column(
            "printing_id",
            sa.Uuid(),
            sa.ForeignKey(
                "card_printings.id",
                ondelete="CASCADE",
                name=op.f("fk_price_observations_printing_id_card_printings"),
            ),
            nullable=False,
        ),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("price", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("condition", sa.String(4)),
        sa.Column("source_reference", sa.Text()),
        sa.CheckConstraint("price > 0", name=op.f("ck_price_observations_positive_price")),
        sa.CheckConstraint("quantity > 0", name=op.f("ck_price_observations_positive_quantity")),
        sa.CheckConstraint(
            "currency IN ('EUR','USD','ARS','BRL','PYG','UYU','BOB')",
            name=op.f("ck_price_observations_valid_currency"),
        ),
    )
    op.create_index("ix_price_observations_printing_id", "price_observations", ["printing_id"])
    op.create_index(
        "ix_price_observations_printing_time",
        "price_observations",
        ["printing_id", "observed_at"],
    )


def downgrade():
    op.drop_table("price_observations")
    op.drop_table("banlist_list_entries")
    op.drop_table("banlist_lists")
