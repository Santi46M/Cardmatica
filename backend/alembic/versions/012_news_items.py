"""News for the home page: about the site and about Yu-Gi-Oh!.

Revision ID: 012_news_items
Revises: 011_canonical_rarities
"""

import sqlalchemy as sa

from alembic import op

revision = "012_news_items"
down_revision = "011_canonical_rarities"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "news_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("section", sa.String(10), nullable=False),
        sa.Column("title", sa.String(140), nullable=False),
        sa.Column("summary", sa.String(400), nullable=False),
        sa.Column("url", sa.String(500), nullable=True),
        sa.Column("source_name", sa.String(120), nullable=True),
        sa.Column("published_on", sa.Date(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_news_items")),
        sa.UniqueConstraint("key", name=op.f("uq_news_items_key")),
        sa.CheckConstraint(
            "section IN ('site', 'yugioh')", name=op.f("ck_news_items_valid_section")
        ),
    )
    op.create_index(op.f("ix_news_items_section"), "news_items", ["section"])
    op.create_index(op.f("ix_news_items_published_on"), "news_items", ["published_on"])


def downgrade():
    op.drop_index(op.f("ix_news_items_published_on"), table_name="news_items")
    op.drop_index(op.f("ix_news_items_section"), table_name="news_items")
    op.drop_table("news_items")
