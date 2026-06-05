"""Widen organization_profile.logo_key to TEXT.

The logo is stored as a base64 data URL (can be hundreds of KB), which does
not fit in VARCHAR(255).

Revision ID: 0004_logo_text
Revises: 0003_settings_tables
Create Date: 2026-06-04
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004_logo_text"
down_revision = "0003_settings_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "organization_profile",
        "logo_key",
        existing_type=sa.String(length=255),
        type_=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "organization_profile",
        "logo_key",
        existing_type=sa.Text(),
        type_=sa.String(length=255),
        existing_nullable=True,
    )
