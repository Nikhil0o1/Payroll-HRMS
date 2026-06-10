"""Birthday-wish log table (idempotent per employee per year).

Revision ID: 0016_birthday_wishes
Revises: 0015_drop_photo_key
Create Date: 2026-06-09
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0016_birthday_wishes"
down_revision = "0015_drop_photo_key"
branch_labels = None
depends_on = None


def _ts_columns():
    return (
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def upgrade() -> None:
    op.create_table(
        "birthday_wishes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False, server_default="email"),
        sa.Column("sent_to", sa.String(length=255), nullable=True),
        sa.Column("delivered", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sent_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        *_ts_columns(),
        sa.UniqueConstraint("employee_id", "year", name="uq_birthday_wish_employee_year"),
    )
    op.create_index("ix_birthday_wishes_employee_id", "birthday_wishes", ["employee_id"])
    op.create_index("ix_birthday_wishes_year", "birthday_wishes", ["year"])


def downgrade() -> None:
    op.drop_index("ix_birthday_wishes_year", table_name="birthday_wishes")
    op.drop_index("ix_birthday_wishes_employee_id", table_name="birthday_wishes")
    op.drop_table("birthday_wishes")
