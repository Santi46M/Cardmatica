"""Printing images by source (staff, Yugipedia, seller) with moderation.

Existing rows are Yugipedia scans: they become source "yugipedia" and stay
approved for review, so their rights status keeps deciding whether they show.

Revision ID: 016_image_sources
Revises: 015_card_views
"""

import sqlalchemy as sa

from alembic import op

revision = "016_image_sources"
down_revision = "015_card_views"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "card_images",
        sa.Column("source_slug", sa.String(20), nullable=False, server_default="yugipedia"),
    )
    op.add_column(
        "card_images",
        sa.Column("review_status", sa.String(20), nullable=False, server_default="approved"),
    )
    op.add_column("card_images", sa.Column("uploaded_by_id", sa.Uuid(), nullable=True))
    op.add_column("card_images", sa.Column("reviewed_by", sa.String(254), nullable=True))
    op.add_column("card_images", sa.Column("review_note", sa.Text(), nullable=True))
    op.add_column(
        "card_images", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_foreign_key(
        op.f("fk_card_images_uploaded_by_id_users"),
        "card_images",
        "users",
        ["uploaded_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        op.f("ck_card_images_valid_image_source"),
        "card_images",
        "source_slug IN ('staff', 'yugipedia', 'seller')",
    )
    op.create_check_constraint(
        op.f("ck_card_images_valid_review_status"),
        "card_images",
        "review_status IN ('pending', 'approved', 'rejected')",
    )
    op.create_index(
        op.f("ix_card_images_review_status"), "card_images", ["review_status"], unique=False
    )
    op.create_index(
        op.f("ix_card_images_uploaded_by_id"), "card_images", ["uploaded_by_id"], unique=False
    )
    # The model has no server defaults; they were only needed for the existing rows.
    op.alter_column("card_images", "source_slug", server_default=None)
    op.alter_column("card_images", "review_status", server_default=None)


def downgrade():
    uploads = op.get_bind().scalar(
        sa.text("SELECT count(*) FROM card_images WHERE source_slug <> 'yugipedia'")
    )
    if uploads:
        raise RuntimeError("Exportar las fotos de vendedores y staff antes de retroceder")
    op.drop_index(op.f("ix_card_images_uploaded_by_id"), table_name="card_images")
    op.drop_index(op.f("ix_card_images_review_status"), table_name="card_images")
    op.drop_constraint(op.f("ck_card_images_valid_review_status"), "card_images", type_="check")
    op.drop_constraint(op.f("ck_card_images_valid_image_source"), "card_images", type_="check")
    op.drop_constraint(
        op.f("fk_card_images_uploaded_by_id_users"), "card_images", type_="foreignkey"
    )
    for column in (
        "reviewed_at",
        "review_note",
        "reviewed_by",
        "uploaded_by_id",
        "review_status",
        "source_slug",
    ):
        op.drop_column("card_images", column)
