"""Stable field citations and substring search indexes.

Revision ID: 002_provenance_search
Revises: d9340b466973
"""

import sqlalchemy as sa
from alembic import op

revision = "002_provenance_search"
down_revision = "d9340b466973"
branch_labels = None
depends_on = None

SEARCH_INDEXES = [
    ("card_names", "name"),
    ("sets", "name"),
    ("rarities", "name"),
    ("archetypes", "name"),
    ("card_printings", "code"),
]


def upgrade():
    op.add_column("field_observations", sa.Column("source_url", sa.Text(), nullable=True))
    op.execute(
        "UPDATE field_observations SET source_url = (SELECT url FROM source_references WHERE id = field_observations.reference_id)"
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        for table, column in SEARCH_INDEXES:
            op.create_index(
                f"ix_{table}_{column}_trgm",
                table,
                [column],
                postgresql_using="gin",
                postgresql_ops={column: "gin_trgm_ops"},
            )
        op.create_index(
            "uq_current_official_text",
            "card_text_versions",
            ["card_id", "language"],
            unique=True,
            postgresql_where=sa.text("is_current AND is_official"),
        )


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.drop_index("uq_current_official_text", table_name="card_text_versions")
        for table, column in reversed(SEARCH_INDEXES):
            op.drop_index(f"ix_{table}_{column}_trgm", table_name=table)
    op.drop_column("field_observations", "source_url")
