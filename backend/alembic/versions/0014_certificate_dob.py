"""Add certificate_date_of_birth to employee profile.

Official DOB as per birth/10th certificate — often differs from the personal
DOB in India and is the one used for statutory records.

Revision ID: 0014_certificate_dob
Revises: 0013_bank_extra
Create Date: 2026-06-09
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0014_certificate_dob"
down_revision = "0013_bank_extra"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employee_profiles",
        sa.Column("certificate_date_of_birth", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("employee_profiles", "certificate_date_of_birth")
