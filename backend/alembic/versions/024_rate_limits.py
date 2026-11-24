"""Attempt counters shared by every server (app/services/rate_limits.py).

Revision ID: 024_rate_limits
Revises: 023_rarity_placeholders
"""

import sqlalchemy as sa

from alembic import op

revision = "024_rate_limits"
down_revision = "023_rarity_placeholders"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "rate_limits",
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("minute", sa.Integer(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("key", "minute", name=op.f("pk_rate_limits")),
    )
    op.create_index(op.f("ix_rate_limits_minute"), "rate_limits", ["minute"])


def downgrade():
    op.drop_index(op.f("ix_rate_limits_minute"), table_name="rate_limits")
    op.drop_table("rate_limits")
