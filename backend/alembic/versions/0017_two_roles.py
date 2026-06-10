"""Collapse roles to EMPLOYEE + ADMIN.

MANAGER / HR_ADMIN / SUPER_ADMIN are merged into a single ADMIN role (HR does
everything). Existing users on any of those roles are repointed to ADMIN and the
now-unused role rows are removed. EMPLOYEE is untouched.

Revision ID: 0017_two_roles
Revises: 0016_birthday_wishes
Create Date: 2026-06-09
"""
from __future__ import annotations

from alembic import op

revision = "0017_two_roles"
down_revision = "0016_birthday_wishes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Promote one legacy admin row to the canonical ADMIN (prefer SUPER_ADMIN).
    op.execute(
        """
        UPDATE roles SET name = 'ADMIN', description = 'Admin'
        WHERE id = (
            SELECT id FROM roles WHERE name IN ('SUPER_ADMIN', 'HR_ADMIN', 'MANAGER')
            ORDER BY CASE name WHEN 'SUPER_ADMIN' THEN 1 WHEN 'HR_ADMIN' THEN 2 ELSE 3 END
            LIMIT 1
        )
        """
    )
    # 2. Repoint any users still on a leftover legacy admin role to ADMIN.
    op.execute(
        """
        UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'ADMIN' LIMIT 1)
        WHERE role_id IN (SELECT id FROM roles WHERE name IN ('MANAGER', 'HR_ADMIN', 'SUPER_ADMIN'))
        """
    )
    # 3. Drop the now-orphaned legacy admin role rows.
    op.execute("DELETE FROM roles WHERE name IN ('MANAGER', 'HR_ADMIN', 'SUPER_ADMIN')")


def downgrade() -> None:
    # Best-effort restore of the 4-tier structure (sub-role of each admin user is
    # not recoverable — they all map back to SUPER_ADMIN).
    op.execute("UPDATE roles SET name = 'SUPER_ADMIN', description = 'Super Admin' WHERE name = 'ADMIN'")
    op.execute(
        """
        INSERT INTO roles (name, description, created_at, updated_at)
        SELECT v.name, v.descr, now(), now()
        FROM (VALUES ('MANAGER', 'Manager'), ('HR_ADMIN', 'Hr Admin')) AS v(name, descr)
        WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.name = v.name)
        """
    )
