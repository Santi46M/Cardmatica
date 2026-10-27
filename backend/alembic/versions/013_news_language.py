"""Each news item says its language: the home page shows the visitor's.

Revision ID: 013_news_language
Revises: 012_news_items
"""

import sqlalchemy as sa

from alembic import op

revision = "013_news_language"
down_revision = "012_news_items"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "news_items", sa.Column("language", sa.String(2), nullable=False, server_default="es")
    )
    op.create_check_constraint(
        op.f("ck_news_items_valid_language"), "news_items", "language IN ('es', 'pt', 'en')"
    )


def downgrade():
    op.drop_constraint(op.f("ck_news_items_valid_language"), "news_items", type_="check")
    op.drop_column("news_items", "language")
