"""Profile, preferences and wantlists stored with the account.

Revision ID: 008_account_data
Revises: 007_accounts
"""

import sqlalchemy as sa

from alembic import op

revision = "008_account_data"
down_revision = "007_accounts"
branch_labels = None
depends_on = None


def timestamps():
    return [
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def user_fk(table):
    return sa.Column(
        "user_id",
        sa.Uuid(),
        sa.ForeignKey("users.id", ondelete="CASCADE", name=op.f(f"fk_{table}_user_id_users")),
        nullable=False,
    )


def upgrade():
    op.create_table(
        "user_profiles",
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_profiles")),
        user_fk("user_profiles"),
        sa.Column("account_role", sa.String(10)),
        sa.Column("full_name", sa.String(120)),
        sa.Column("store_name", sa.String(80)),
        sa.Column("country", sa.String(40)),
        sa.Column("address", sa.String(200)),
        sa.Column("phone", sa.String(30)),
        sa.Column("payment_methods", sa.JSON(), nullable=False),
        sa.Column("preferences", sa.JSON(), nullable=False),
        sa.UniqueConstraint("user_id", name=op.f("uq_user_profiles_user_id")),
    )
    op.create_table(
        "wantlists",
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_wantlists")),
        user_fk("wantlists"),
        sa.Column("client_id", sa.String(40), nullable=False),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("user_id", "client_id", name=op.f("uq_wantlists_user_id")),
    )
    op.create_index(op.f("ix_wantlists_user_id"), "wantlists", ["user_id"])
    op.create_table(
        "wantlist_items",
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_wantlist_items")),
        sa.Column(
            "wantlist_id",
            sa.Uuid(),
            sa.ForeignKey(
                "wantlists.id",
                ondelete="CASCADE",
                name=op.f("fk_wantlist_items_wantlist_id_wantlists"),
            ),
            nullable=False,
        ),
        sa.Column("client_id", sa.String(40), nullable=False),
        sa.Column(
            "card_id",
            sa.Uuid(),
            sa.ForeignKey(
                "cards.id", ondelete="CASCADE", name=op.f("fk_wantlist_items_card_id_cards")
            ),
            nullable=False,
        ),
        sa.Column(
            "printing_id",
            sa.Uuid(),
            sa.ForeignKey(
                "card_printings.id",
                ondelete="SET NULL",
                name=op.f("fk_wantlist_items_printing_id_card_printings"),
            ),
        ),
        sa.Column("market", sa.String(8), nullable=False),
        sa.Column("language", sa.String(4), nullable=False),
        sa.Column("edition", sa.String(20), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("alert_amount", sa.Numeric(12, 2)),
        sa.Column("alert_currency", sa.String(3)),
        sa.Column("seen_sale_at", sa.DateTime(timezone=True)),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(op.f("ix_wantlist_items_wantlist_id"), "wantlist_items", ["wantlist_id"])
    op.create_index(op.f("ix_wantlist_items_card_id"), "wantlist_items", ["card_id"])


def downgrade():
    op.drop_table("wantlist_items")
    op.drop_table("wantlists")
    op.drop_table("user_profiles")
