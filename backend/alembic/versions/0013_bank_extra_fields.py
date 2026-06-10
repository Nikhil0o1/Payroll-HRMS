"""Extra bank fields on employee profile: branch, account holder name, account type.

Revision ID: 0013_bank_extra
Revises: 0012_drop_sal_templates
Create Date: 2026-06-08
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0013_bank_extra"
down_revision = "0012_drop_sal_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("employee_profiles", sa.Column("bank_branch", sa.String(length=120), nullable=True))
    op.add_column(
        "employee_profiles",
        sa.Column("bank_account_holder_name", sa.String(length=120), nullable=True),
    )
    op.add_column("employee_profiles", sa.Column("bank_account_type", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("employee_profiles", "bank_account_type")
    op.drop_column("employee_profiles", "bank_account_holder_name")
    op.drop_column("employee_profiles", "bank_branch")
