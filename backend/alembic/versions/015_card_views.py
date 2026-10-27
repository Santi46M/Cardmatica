"""Cards a signed-in person opened, for "Vistas recientemente" on the home page.

Guests keep that list in their own browser; an account keeps it here so it
follows the person to every device. Only the latest few are kept.

Revision ID: 015_card_views
Revises: 014_adult_confirmation
"""

import sqlalchemy as sa

from alembic import op

revision = "015_card_views"
down_revision = "014_adult_confirmation"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "card_views",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("card_id", sa.Uuid(), nullable=False),
        sa.Column("viewed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["card_id"], ["cards.id"], name=op.f("fk_card_views_card_id_cards"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_card_views_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_card_views")),
        sa.UniqueConstraint("user_id", "card_id", name=op.f("uq_card_views_user_id")),
    )
    op.create_index(op.f("ix_card_views_user_id"), "card_views", ["user_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_card_views_user_id"), table_name="card_views")
    op.drop_table("card_views")
