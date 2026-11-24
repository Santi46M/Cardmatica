"""Profiles no longer keep an address or a phone number.

They were optional, for shipping that does not exist yet: personal data with
no use (security review, #5). Dropping the columns deletes what was saved.
They come back with orders, asked only of whoever buys.

Revision ID: 025_profile_without_address
Revises: 024_rate_limits
"""

import sqlalchemy as sa

from alembic import op

revision = "025_profile_without_address"
down_revision = "024_rate_limits"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user_profiles") as table:
        table.drop_column("address")
        table.drop_column("phone")


def downgrade():
    # The columns come back empty: what they held was deleted.
    with op.batch_alter_table("user_profiles") as table:
        table.add_column(sa.Column("address", sa.String(length=200), nullable=True))
        table.add_column(sa.Column("phone", sa.String(length=30), nullable=True))
