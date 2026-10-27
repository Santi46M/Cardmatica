"""Single-use email links: confirm the address, reset the password.

Revision ID: 009_account_tokens
Revises: 008_account_data
"""

import sqlalchemy as sa

from alembic import op

revision = "009_account_tokens"
down_revision = "008_account_data"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "account_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_account_tokens")),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey(
                "users.id", ondelete="CASCADE", name=op.f("fk_account_tokens_user_id_users")
            ),
            nullable=False,
        ),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("token_hash", name=op.f("uq_account_tokens_token_hash")),
    )
    op.create_index(op.f("ix_account_tokens_user_id"), "account_tokens", ["user_id"])


def downgrade():
    op.drop_table("account_tokens")
