"""Anonymous usage counts per day (no cookies, no personal data).

Revision ID: 010_usage_counts
Revises: 009_account_tokens
"""

import sqlalchemy as sa

from alembic import op

revision = "010_usage_counts"
down_revision = "009_account_tokens"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "usage_counts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_usage_counts")),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.UniqueConstraint("day", "key", name=op.f("uq_usage_counts_day")),
    )
    op.create_index(op.f("ix_usage_counts_day"), "usage_counts", ["day"])


def downgrade():
    op.drop_table("usage_counts")
