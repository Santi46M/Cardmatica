"""Printing images are scans only; seller photos go with each listing.

The catalogue shows, from most to least specific, the scan of the exact printing
and then the card's general artwork. Photos uploaded by sellers are not catalogue
images: they will belong to the seller's own listing. This removes the upload
and review columns added in 016 and any uploaded rows (none had been approved
for publication before this change).

Revision ID: 017_scans_only
Revises: 016_image_sources
"""

import sqlalchemy as sa

from alembic import op

revision = "017_scans_only"
down_revision = "016_image_sources"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("DELETE FROM card_images WHERE source_slug <> 'yugipedia'")
    op.drop_index(op.f("ix_card_images_uploaded_by_id"), table_name="card_images")
    op.drop_index(op.f("ix_card_images_review_status"), table_name="card_images")
    op.drop_constraint(op.f("ck_card_images_valid_review_status"), "card_images", type_="check")
    op.drop_constraint(op.f("ck_card_images_valid_image_source"), "card_images", type_="check")
    op.drop_constraint(
        op.f("fk_card_images_uploaded_by_id_users"), "card_images", type_="foreignkey"
    )
    for column in ("reviewed_at", "review_note", "reviewed_by", "uploaded_by_id", "review_status"):
        op.drop_column("card_images", column)
    op.create_check_constraint(
        op.f("ck_card_images_valid_image_source"), "card_images", "source_slug IN ('yugipedia')"
    )


def downgrade():
    op.drop_constraint(op.f("ck_card_images_valid_image_source"), "card_images", type_="check")
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
    op.alter_column("card_images", "review_status", server_default=None)
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
