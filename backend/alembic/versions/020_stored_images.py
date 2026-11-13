"""Image files kept in the database, for hosts with no lasting disk.

The test site on Vercel keeps its card pictures here (IMAGE_STORAGE=database):
each row is one file of the image folder, under the same name.

Revision ID: 020_stored_images
Revises: 019_staff
"""

import sqlalchemy as sa

from alembic import op

revision = "020_stored_images"
down_revision = "019_staff"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "stored_images",
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("media_type", sa.String(length=40), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("name", name=op.f("pk_stored_images")),
    )


def downgrade():
    op.drop_table("stored_images")
