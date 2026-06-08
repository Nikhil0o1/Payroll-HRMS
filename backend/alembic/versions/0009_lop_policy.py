"""Add organization_profile.lop_policy (payroll loss-of-pay policy).

Revision ID: 0009_lop_policy
Revises: 0008_announcements
Create Date: 2026-06-05
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009_lop_policy"
down_revision = "0008_announcements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organization_profile",
        sa.Column("lop_policy", sa.String(length=16), nullable=False, server_default="attendance"),
    )


def downgrade() -> None:
    op.drop_column("organization_profile", "lop_policy")
