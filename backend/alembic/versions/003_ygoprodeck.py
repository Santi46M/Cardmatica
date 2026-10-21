"""Provider identity, regional availability and general artwork.

Revision ID: 003_ygoprodeck
Revises: 002_provenance_search
"""

import sqlalchemy as sa
from alembic import op

revision = "003_ygoprodeck"
down_revision = "002_provenance_search"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("cards", sa.Column("ygoprodeck_id", sa.Integer(), nullable=True))
    op.add_column(
        "cards", sa.Column("available_markets", sa.JSON(), nullable=False, server_default="[]")
    )
    op.create_unique_constraint("uq_cards_ygoprodeck_id", "cards", ["ygoprodeck_id"])
    op.create_table(
        "card_artworks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "card_id", sa.Uuid(), sa.ForeignKey("cards.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("source_slug", sa.String(30), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("small_source_url", sa.Text()),
        sa.Column("author", sa.Text()),
        sa.Column("license", sa.Text()),
        sa.Column("license_url", sa.Text()),
        sa.Column("rights_status", sa.String(30), nullable=False),
        sa.Column("authorization_reference", sa.Text()),
        sa.Column("local_path", sa.String(300)),
        sa.Column("thumbnail_path", sa.String(300)),
        sa.Column("sha256", sa.String(64)),
        sa.UniqueConstraint("card_id", "source_slug", "external_id"),
    )
    op.create_index("ix_card_artworks_card_id", "card_artworks", ["card_id"])
    op.add_column("card_text_versions", sa.Column("source_slug", sa.String(30), nullable=True))
    op.execute(
        "UPDATE card_text_versions SET source_slug = CASE WHEN is_official THEN 'konami' ELSE 'yugipedia' END"
    )
    op.alter_column("card_text_versions", "source_slug", nullable=False)
    op.drop_constraint("uq_card_text_versions_card_id", "card_text_versions", type_="unique")
    op.create_unique_constraint(
        "uq_card_text_versions_card_id",
        "card_text_versions",
        ["card_id", "language", "content_hash", "is_official", "source_slug"],
    )


def downgrade():
    # Source-separated histories may contain equal content: preserve data rather than merge it.
    connection = op.get_bind()
    duplicates = connection.scalar(
        sa.text(
            "SELECT count(*) FROM (SELECT 1 FROM card_text_versions GROUP BY card_id, language, content_hash, is_official HAVING count(*) > 1) AS duplicates"
        )
    )
    if duplicates:
        raise RuntimeError("Exportar y reconciliar textos por fuente antes de retroceder")
    op.drop_constraint("uq_card_text_versions_card_id", "card_text_versions", type_="unique")
    op.create_unique_constraint(
        "uq_card_text_versions_card_id",
        "card_text_versions",
        ["card_id", "language", "content_hash", "is_official"],
    )
    op.drop_column("card_text_versions", "source_slug")
    op.drop_table("card_artworks")
    op.drop_constraint("uq_cards_ygoprodeck_id", "cards", type_="unique")
    op.drop_column("cards", "available_markets")
    op.drop_column("cards", "ygoprodeck_id")
