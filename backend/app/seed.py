"""Bootstrap script: roles, default leave types, and a single admin user.

Designed to be idempotent and safe to run on every startup. The intent is that
a fresh database is *immediately usable* by employees — they shouldn't have to
wait for the admin to manually configure leave types before the very first
leave application can be submitted.

What this bootstrap creates:

    1. Role rows (so the FK constraint on `users.role_id` is satisfied).
    2. A single SUPER_ADMIN user, sourced from FIRST_SUPERADMIN_EMAIL/PASSWORD.
    3. A small set of standard leave types (Casual / Sick / Earned) — only if
       NO leave types exist yet. Admins can rename, retune quotas, recolor,
       or delete these from the Leave Types page; the bootstrap won't fight
       admin edits because it only seeds an empty table.

What this bootstrap deliberately does NOT create:

    - Holidays: admin adds them from the Holidays page (region-specific).
    - Employees: real employees self-register via /signup, or are added by
      an admin from the Employees page.

Run:  python -m app.seed
Idempotent: safe to run multiple times.
"""
from __future__ import annotations

import logging

from sqlalchemy import func, select

from app import models  # noqa: F401  ensure all tables registered
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models.enums import RoleName
from app.models.leave import LeaveType
from app.models.user import Role, User

log = logging.getLogger("hrms.seed")
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")


def ensure_roles(db) -> dict[RoleName, Role]:
    out: dict[RoleName, Role] = {}
    for r in RoleName:
        row = db.scalar(select(Role).where(Role.name == r))
        if not row:
            row = Role(name=r, description=r.value.replace("_", " ").title())
            db.add(row)
            db.flush()
        out[r] = row
    return out


def ensure_super_admin(db, roles: dict[RoleName, Role]) -> User:
    email = settings.FIRST_SUPERADMIN_EMAIL.lower().strip()
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        return existing
    user = User(
        email=email,
        hashed_password=hash_password(settings.FIRST_SUPERADMIN_PASSWORD),
        role_id=roles[RoleName.SUPER_ADMIN].id,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


# Conservative defaults: only seeded into a completely empty leave_types table.
# Quotas reflect typical Indian payroll practice; admins can change everything
# (including deleting types they don't want) from the Leave Types admin page.
_DEFAULT_LEAVE_TYPES: tuple[dict, ...] = (
    {"code": "CASUAL", "name": "Casual Leave", "default_annual_quota": 12, "is_paid": True, "color": "#3b82f6"},
    {"code": "SICK", "name": "Sick Leave", "default_annual_quota": 12, "is_paid": True, "color": "#ef4444"},
    {"code": "EARNED", "name": "Earned Leave", "default_annual_quota": 15, "is_paid": True, "color": "#10b981"},
)


def ensure_default_leave_types(db) -> list[LeaveType]:
    """Seed Casual/Sick/Earned only when leave_types is empty.

    Once an admin has configured even a single leave type, this function does
    nothing — we never want to silently re-introduce a type the admin chose to
    delete.
    """
    existing_count = db.scalar(select(func.count(LeaveType.id))) or 0
    if existing_count > 0:
        return []
    created: list[LeaveType] = []
    for spec in _DEFAULT_LEAVE_TYPES:
        lt = LeaveType(**spec)
        db.add(lt)
        created.append(lt)
    db.flush()
    return created


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        roles = ensure_roles(db)
        log.info("Roles ensured")
        ensure_super_admin(db, roles)
        log.info("Bootstrap admin ensured (%s)", settings.FIRST_SUPERADMIN_EMAIL)
        seeded = ensure_default_leave_types(db)
        if seeded:
            log.info("Seeded default leave types (%s)", ", ".join(s.code for s in seeded))
        db.commit()
        log.info("Bootstrap complete. Add holidays from the admin UI.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
