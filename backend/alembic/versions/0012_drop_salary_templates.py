"""Drop the unused salary_templates table.

Salary templates were replaced by per-employment-type salary components
(migration 0010). The table, model, schemas, service, and endpoints are gone;
this removes the now-orphaned table.

Revision ID: 0012_drop_sal_templates
Revises: 0011_employee_docs
Create Date: 2026-06-08
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0012_drop_sal_templates"
down_revision = "0011_employee_docs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_salary_templates_name", table_name="salary_templates")
    op.drop_table("salary_templates")


def downgrade() -> None:
    op.create_table(
        "salary_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("annual_ctc", sa.Numeric(12, 2), nullable=True),
        sa.Column("components", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("name", name="uq_salary_template_name"),
    )
    op.create_index("ix_salary_templates_name", "salary_templates", ["name"], unique=True)
