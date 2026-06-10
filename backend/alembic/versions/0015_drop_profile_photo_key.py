"""Drop the unused employee_profiles.photo_key column.

Dead leftover from an earlier design: employee avatars are stored as an inline
base64 data URL on employees.photo_url, never on this column (it was always
NULL and had zero code references).

Revision ID: 0015_drop_photo_key
Revises: 0014_certificate_dob
Create Date: 2026-06-09
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0015_drop_photo_key"
down_revision = "0014_certificate_dob"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("employee_profiles", "photo_key")


def downgrade() -> None:
    op.add_column(
        "employee_profiles",
        sa.Column("photo_key", sa.String(length=255), nullable=True),
    )
