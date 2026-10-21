"""Preserve the selected localized name's source.

Revision ID: 004_name_source
Revises: 003_ygoprodeck
"""

import sqlalchemy as sa
from alembic import op

revision = "004_name_source"
down_revision = "003_ygoprodeck"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("card_names", sa.Column("source_slug", sa.String(30), nullable=True))
    op.execute(
        "UPDATE card_names SET source_slug = CASE WHEN is_official THEN 'konami' ELSE 'yugipedia' END"
    )
    op.alter_column("card_names", "source_slug", nullable=False)


def downgrade():
    op.drop_column("card_names", "source_slug")
