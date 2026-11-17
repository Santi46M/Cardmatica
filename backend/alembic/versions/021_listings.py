"""Sellers' stock: the copies of each printing they have for sale.

Revision ID: 021_listings
Revises: 020_stored_images
"""

import sqlalchemy as sa

from alembic import op

revision = "021_listings"
down_revision = "020_stored_images"
branch_labels = None
depends_on = None

CURRENCIES = ("EUR", "USD", "ARS", "BRL", "PYG", "UYU", "BOB")
CONDITIONS = ("MT", "NM", "EX", "GD", "LP", "PL", "PO")
LANGUAGES = ("ES", "EN", "PT", "FR", "DE", "IT", "JP", "KO", "ZH")


def one_of(column, values):
    return f"{column} IN (" + ",".join(f"'{value}'" for value in values) + ")"


def upgrade():
    op.create_table(
        "listings",
        sa.Column("seller_id", sa.Uuid(), nullable=False),
        sa.Column("printing_id", sa.Uuid(), nullable=False),
        sa.Column("condition", sa.String(length=2), nullable=False),
        sa.Column("language", sa.String(length=2), nullable=False),
        sa.Column("finish", sa.String(length=20), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("price", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("comment", sa.String(length=200), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("price > 0", name=op.f("ck_listings_positive_price")),
        sa.CheckConstraint("quantity > 0", name=op.f("ck_listings_positive_quantity")),
        sa.CheckConstraint(one_of("currency", CURRENCIES), name=op.f("ck_listings_valid_currency")),
        sa.CheckConstraint(
            one_of("condition", CONDITIONS), name=op.f("ck_listings_valid_condition")
        ),
        sa.CheckConstraint(one_of("language", LANGUAGES), name=op.f("ck_listings_valid_language")),
        sa.ForeignKeyConstraint(
            ["printing_id"],
            ["card_printings.id"],
            name=op.f("fk_listings_printing_id_card_printings"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["seller_id"],
            ["users.id"],
            name=op.f("fk_listings_seller_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_listings")),
    )
    op.create_index(op.f("ix_listings_seller_id"), "listings", ["seller_id"])
    op.create_index(op.f("ix_listings_printing_id"), "listings", ["printing_id"])


def downgrade():
    op.drop_table("listings")
