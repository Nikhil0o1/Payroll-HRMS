"""Add employees.photo_url for profile pictures.

The avatar is stored as a base64 data URL (like the org logo), which can be
tens of KB, so it uses TEXT rather than VARCHAR.

Revision ID: 0005_employee_photo
Revises: 0004_logo_text
Create Date: 2026-06-05
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_employee_photo"
down_revision = "0004_logo_text"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("employees", sa.Column("photo_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("employees", "photo_url")
