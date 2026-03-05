"""repair video_jobs table and indexes if missing

Revision ID: d4e5f6a7b8c9
Revises: b1c2d3e4f5a6
Create Date: 2026-03-05 22:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    try:
        return table_name in set(_inspector().get_table_names())
    except Exception:
        return False


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    try:
        indexes = _inspector().get_indexes(table_name)
    except Exception:
        return False
    return any(index.get("name") == index_name for index in indexes)


def _json_type(bind) -> sa.types.TypeEngine:
    if (bind.dialect.name or "").lower() == "postgresql":
        from sqlalchemy.dialects.postgresql import JSONB

        return JSONB(astext_type=sa.Text())
    return sa.JSON()


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists("video_jobs"):
        payload_default = (
            sa.text("'{}'::jsonb")
            if (bind.dialect.name or "").lower() == "postgresql"
            else sa.text("'{}'")
        )
        op.create_table(
            "video_jobs",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("application_id", sa.Integer(), nullable=True),
            sa.Column("mode", sa.String(), nullable=False, server_default=sa.text("'review'")),
            sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'queued'")),
            sa.Column("provider", sa.String(), nullable=False, server_default=sa.text("'remotion'")),
            sa.Column("output_rel_path", sa.String(), nullable=True),
            sa.Column("error_text", sa.Text(), nullable=True),
            sa.Column("payload_json", _json_type(bind), nullable=False, server_default=payload_default),
            sa.Column("requested_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["application_id"], ["affiliation_applications.id"]),
        )

    indexes: list[tuple[str, list[str], bool]] = [
        ("ix_video_jobs_application_id", ["application_id"], False),
        ("ix_video_jobs_mode", ["mode"], False),
        ("ix_video_jobs_status", ["status"], False),
        ("ix_video_jobs_status_requested_at", ["status", "requested_at"], False),
    ]
    for index_name, columns, unique in indexes:
        if _index_exists("video_jobs", index_name):
            continue
        op.create_index(index_name, "video_jobs", columns, unique=unique)


def downgrade() -> None:
    if _index_exists("video_jobs", "ix_video_jobs_status_requested_at"):
        op.drop_index("ix_video_jobs_status_requested_at", table_name="video_jobs")
