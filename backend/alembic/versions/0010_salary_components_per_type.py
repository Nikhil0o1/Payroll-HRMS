"""Scope salary components by employment type.

Each employment type (FULL_TIME, INTERN, CONTRACT, PART_TIME) gets its own set
of components; codes are unique within a type instead of globally. Existing
rows are assigned to FULL_TIME.

Revision ID: 0010_salary_comp_type
Revises: 0009_lop_policy
Create Date: 2026-06-06
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0010_salary_comp_type"
down_revision = "0009_lop_policy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "salary_component_defs",
        sa.Column("employment_type", sa.String(length=20), nullable=False, server_default="FULL_TIME"),
    )
    op.create_index(
        "ix_salary_component_defs_employment_type", "salary_component_defs", ["employment_type"]
    )
    # Replace the global-unique on `code` with a per-type unique.
    op.drop_index("ix_salary_component_defs_code", table_name="salary_component_defs")
    op.drop_constraint("uq_salary_component_code", "salary_component_defs", type_="unique")
    op.create_index("ix_salary_component_defs_code", "salary_component_defs", ["code"])
    op.create_unique_constraint(
        "uq_salary_component_type_code", "salary_component_defs", ["employment_type", "code"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_salary_component_type_code", "salary_component_defs", type_="unique")
    op.drop_index("ix_salary_component_defs_code", table_name="salary_component_defs")
    op.create_index("ix_salary_component_defs_code", "salary_component_defs", ["code"], unique=True)
    op.create_unique_constraint("uq_salary_component_code", "salary_component_defs", ["code"])
    op.drop_index("ix_salary_component_defs_employment_type", table_name="salary_component_defs")
    op.drop_column("salary_component_defs", "employment_type")
