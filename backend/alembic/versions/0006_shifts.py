"""Shift management: shifts table, employees.shift_id, attendance early-leave.

Revision ID: 0006_shifts
Revises: 0005_employee_photo
Create Date: 2026-06-05
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_shifts"
down_revision = "0005_employee_photo"
branch_labels = None
depends_on = None


def _ts_columns():
    """created_at / updated_at columns required by the shared Base class."""
    return (
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def upgrade() -> None:
    op.create_table(
        "shifts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("grace_minutes", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("full_day_minutes", sa.Integer(), nullable=False, server_default="480"),
        sa.Column("half_day_minutes", sa.Integer(), nullable=False, server_default="240"),
        sa.Column("weekly_offs", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_ts_columns(),
    )
    op.create_index("ix_shifts_name", "shifts", ["name"], unique=True)
    op.create_index("ix_shifts_is_active", "shifts", ["is_active"])

    op.add_column("employees", sa.Column("shift_id", sa.Integer(), nullable=True))
    op.create_index("ix_employees_shift_id", "employees", ["shift_id"])
    op.create_foreign_key(
        "fk_employees_shift_id", "employees", "shifts", ["shift_id"], ["id"]
    )

    op.add_column(
        "attendance_daily",
        sa.Column("is_early_leave", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("attendance_daily", "is_early_leave")
    op.drop_constraint("fk_employees_shift_id", "employees", type_="foreignkey")
    op.drop_index("ix_employees_shift_id", table_name="employees")
    op.drop_column("employees", "shift_id")
    op.drop_index("ix_shifts_is_active", table_name="shifts")
    op.drop_index("ix_shifts_name", table_name="shifts")
    op.drop_table("shifts")
