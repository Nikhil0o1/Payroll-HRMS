"""Employee onboarding documents.

Revision ID: 0011_employee_docs
Revises: 0010_salary_comp_type
Create Date: 2026-06-06
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011_employee_docs"
down_revision = "0010_salary_comp_type"
branch_labels = None
depends_on = None


def _ts_columns():
    return (
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def upgrade() -> None:
    op.create_table(
        "employee_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("doc_type", sa.String(length=40), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=True),
        sa.Column("file_key", sa.String(length=255), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("uploaded_by_user_id", sa.Integer(), nullable=True),
        *_ts_columns(),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"]),
    )
    op.create_index("ix_employee_documents_employee_id", "employee_documents", ["employee_id"])
    op.create_index("ix_employee_documents_doc_type", "employee_documents", ["doc_type"])


def downgrade() -> None:
    op.drop_index("ix_employee_documents_doc_type", table_name="employee_documents")
    op.drop_index("ix_employee_documents_employee_id", table_name="employee_documents")
    op.drop_table("employee_documents")
