"""Secure employee bank details and pending change approvals.

Revision ID: 0007_secure_bank_details
Revises: 0006_shifts
Create Date: 2026-06-05
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from app.core.crypto import encrypt_bank_account, is_encrypted_bank_account

revision = "0007_secure_bank_details"
down_revision = "0006_shifts"
branch_labels = None
depends_on = None


def _ts_columns():
    return (
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


bank_status = sa.Enum(
    "PENDING",
    "APPROVED",
    "REJECTED",
    name="bankdetailchangestatus",
    native_enum=False,
    length=32,
)


def upgrade() -> None:
    with op.batch_alter_table("employee_profiles") as batch_op:
        batch_op.alter_column(
            "bank_account_no",
            existing_type=sa.String(length=34),
            type_=sa.String(length=512),
            existing_nullable=True,
        )

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, bank_account_no FROM employee_profiles "
            "WHERE bank_account_no IS NOT NULL AND bank_account_no != ''"
        )
    ).fetchall()
    for row in rows:
        account_no = row.bank_account_no
        if not is_encrypted_bank_account(account_no):
            conn.execute(
                sa.text(
                    "UPDATE employee_profiles "
                    "SET bank_account_no = :account_no "
                    "WHERE id = :id"
                ),
                {"account_no": encrypt_bank_account(account_no), "id": row.id},
            )

    op.create_table(
        "employee_bank_detail_change_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("requested_by_user_id", sa.Integer(), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("status", bank_status, nullable=False, server_default="PENDING"),
        sa.Column("changes", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("requested_bank_account_no", sa.String(length=512), nullable=True),
        sa.Column("requested_bank_ifsc", sa.String(length=20), nullable=True),
        sa.Column("requested_bank_name", sa.String(length=100), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        *_ts_columns(),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"]),
    )
    op.create_index(
        "ix_employee_bank_detail_change_requests_employee_id",
        "employee_bank_detail_change_requests",
        ["employee_id"],
    )
    op.create_index(
        "ix_employee_bank_detail_change_requests_requested_by_user_id",
        "employee_bank_detail_change_requests",
        ["requested_by_user_id"],
    )
    op.create_index(
        "ix_employee_bank_detail_change_requests_reviewed_by_user_id",
        "employee_bank_detail_change_requests",
        ["reviewed_by_user_id"],
    )
    op.create_index(
        "ix_employee_bank_detail_change_requests_status",
        "employee_bank_detail_change_requests",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_employee_bank_detail_change_requests_status",
        table_name="employee_bank_detail_change_requests",
    )
    op.drop_index(
        "ix_employee_bank_detail_change_requests_reviewed_by_user_id",
        table_name="employee_bank_detail_change_requests",
    )
    op.drop_index(
        "ix_employee_bank_detail_change_requests_requested_by_user_id",
        table_name="employee_bank_detail_change_requests",
    )
    op.drop_index(
        "ix_employee_bank_detail_change_requests_employee_id",
        table_name="employee_bank_detail_change_requests",
    )
    op.drop_table("employee_bank_detail_change_requests")
    with op.batch_alter_table("employee_profiles") as batch_op:
        batch_op.alter_column(
            "bank_account_no",
            existing_type=sa.String(length=512),
            type_=sa.String(length=34),
            existing_nullable=True,
        )
