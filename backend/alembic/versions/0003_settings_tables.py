"""create settings tables: organisation profile, work locations,
salary component defs, salary templates

Revision ID: 0003_settings_tables
Revises: 0002_user_lockout
Create Date: 2026-06-04 11:30:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_settings_tables"
down_revision: Union[str, None] = "0002_user_lockout"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ts_columns():
    """created_at / updated_at columns required by the shared Base class."""
    return (
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def upgrade() -> None:
    # Organisation profile (singleton)
    op.create_table(
        "organization_profile",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False, server_default="My Organisation"),
        sa.Column("legal_name", sa.String(length=200), nullable=True),
        sa.Column("industry", sa.String(length=100), nullable=True),
        sa.Column("business_location", sa.String(length=100), nullable=False, server_default="India"),
        sa.Column("address_line1", sa.String(length=200), nullable=True),
        sa.Column("address_line2", sa.String(length=200), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=100), nullable=True),
        sa.Column("pincode", sa.String(length=12), nullable=True),
        sa.Column("date_format", sa.String(length=20), nullable=False, server_default="dd/MM/yyyy"),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="INR"),
        sa.Column("logo_key", sa.String(length=255), nullable=True),
        sa.Column("work_week", sa.JSON(), nullable=False, server_default=sa.text("'[0,1,2,3,4]'::json")),
        sa.Column("salary_calc_basis", sa.String(length=20), nullable=False, server_default="actual"),
        sa.Column("org_working_days", sa.Integer(), nullable=True),
        sa.Column("pay_day_type", sa.String(length=24), nullable=False, server_default="last_working_day"),
        sa.Column("pay_day", sa.Integer(), nullable=True),
        sa.Column("first_payroll_month", sa.String(length=7), nullable=True),
        *_ts_columns(),
    )

    # Work locations
    op.create_table(
        "work_locations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("address_line1", sa.String(length=200), nullable=True),
        sa.Column("address_line2", sa.String(length=200), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=100), nullable=True),
        sa.Column("pincode", sa.String(length=12), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=False, server_default="India"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        *_ts_columns(),
    )
    op.create_index("ix_work_locations_is_primary", "work_locations", ["is_primary"])

    # Salary component catalog
    op.create_table(
        "salary_component_defs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False, server_default="EARNING"),
        sa.Column("calc_type", sa.String(length=24), nullable=False, server_default="FIXED"),
        sa.Column("calc_value", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("consider_for_epf", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("consider_for_esi", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_ts_columns(),
        sa.UniqueConstraint("code", name="uq_salary_component_code"),
    )
    op.create_index("ix_salary_component_defs_code", "salary_component_defs", ["code"], unique=True)
    op.create_index("ix_salary_component_defs_is_active", "salary_component_defs", ["is_active"])
    op.create_index("ix_salary_component_defs_category", "salary_component_defs", ["category"])

    # Salary templates
    op.create_table(
        "salary_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("annual_ctc", sa.Numeric(12, 2), nullable=True),
        sa.Column("components", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_ts_columns(),
        sa.UniqueConstraint("name", name="uq_salary_template_name"),
    )
    op.create_index("ix_salary_templates_name", "salary_templates", ["name"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_salary_templates_name", table_name="salary_templates")
    op.drop_table("salary_templates")
    op.drop_index("ix_salary_component_defs_category", table_name="salary_component_defs")
    op.drop_index("ix_salary_component_defs_is_active", table_name="salary_component_defs")
    op.drop_index("ix_salary_component_defs_code", table_name="salary_component_defs")
    op.drop_table("salary_component_defs")
    op.drop_index("ix_work_locations_is_primary", table_name="work_locations")
    op.drop_table("work_locations")
    op.drop_table("organization_profile")
