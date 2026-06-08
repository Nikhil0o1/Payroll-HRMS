"""Company announcements.

Revision ID: 0008_announcements
Revises: 0007_secure_bank_details
Create Date: 2026-06-05
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0008_announcements"
down_revision = "0007_secure_bank_details"
branch_labels = None
depends_on = None


def _ts_columns():
    return (
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def upgrade() -> None:
    op.create_table(
        "announcements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        *_ts_columns(),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
    )
    op.create_index("ix_announcements_is_active", "announcements", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_announcements_is_active", table_name="announcements")
    op.drop_table("announcements")
