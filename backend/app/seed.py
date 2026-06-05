"""Bootstrap script: roles + a single admin user. Nothing else.

In keeping with this product being production-grade, the bootstrap intentionally
does NOT pre-populate any business data:

    - Leave types (Casual / Sick / Earned with quotas): admin defines them
      from the Leave Types admin page.
    - Holidays: admin adds them from the Holidays page.
    - Employees: real employees self-register via /signup, or are added by
      an admin from the Employees page.

The only things this bootstrap creates are:

    1. Role rows (so the FK constraint on `users.role_id` is satisfied).
    2. A single SUPER_ADMIN user, sourced from FIRST_SUPERADMIN_EMAIL/PASSWORD
       in the environment.

Run:  python -m app.seed
Idempotent: safe to run multiple times. Will not overwrite existing rows.
"""
from __future__ import annotations

import logging

from sqlalchemy import select

from app import models  # noqa: F401  ensure all tables registered
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models.enums import RoleName
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


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        roles = ensure_roles(db)
        log.info("Roles ensured")
        ensure_super_admin(db, roles)
        log.info("Bootstrap admin ensured (%s)", settings.FIRST_SUPERADMIN_EMAIL)
        db.commit()
        log.info("Bootstrap complete. Configure leave types and holidays from the admin UI.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
