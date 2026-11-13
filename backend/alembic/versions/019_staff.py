"""Tools for moderators and administrators.

An account can be blocked by the staff (users.blocked_at): it cannot sign in
and its sessions stop working until it is unblocked. What the staff does is
kept in staff_actions, with the names copied, so it still reads after the
account it concerns is gone.

Revision ID: 019_staff
Revises: 018_games
"""

import sqlalchemy as sa

from alembic import op

revision = "019_staff"
down_revision = "018_games"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "staff_actions",
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("actor", sa.String(length=254), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=True),
        sa.Column("target", sa.String(length=254), nullable=True),
        sa.Column("detail", sa.String(length=300), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_staff_actions_actor_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_staff_actions")),
    )
    op.create_index(
        op.f("ix_staff_actions_target_id"), "staff_actions", ["target_id"], unique=False
    )
    op.add_column("users", sa.Column("blocked_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("users", "blocked_at")
    op.drop_index(op.f("ix_staff_actions_target_id"), table_name="staff_actions")
    op.drop_table("staff_actions")
