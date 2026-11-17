"""A photo of the copy on sale, required for the dearer cards.

Revision ID: 022_listing_photos
Revises: 021_listings
"""

import sqlalchemy as sa

from alembic import op

revision = "022_listing_photos"
down_revision = "021_listings"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("listings", sa.Column("photo", sa.String(length=300), nullable=True))


def downgrade():
    op.drop_column("listings", "photo")
