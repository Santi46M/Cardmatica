"""When a person confirmed being an adult on signing up.

Cardmática is for people of 18 or more: a marketplace with payments does not
collect children's data (LGPD art. 14 asks a parent's consent for them).
Accounts created before stay empty.

Revision ID: 014_adult_confirmation
Revises: 013_news_language
"""

import sqlalchemy as sa

from alembic import op

revision = "014_adult_confirmation"
down_revision = "013_news_language"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users", sa.Column("adult_confirmed_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade():
    op.drop_column("users", "adult_confirmed_at")
