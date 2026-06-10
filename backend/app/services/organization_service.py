"""Service layer for the Settings area: organisation profile, work locations,
salary components, and pay schedule.

`OrganizationProfile` is a singleton row (id == 1). The first call to
:func:`get_profile` lazily creates it with sensible defaults, so the API can
remain idempotent.
"""
from __future__ import annotations

import secrets
import string
from typing import List, Optional

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.email_policy import assert_email_domain_allowed
from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.models.employee import Employee
from app.models.enums import RoleName
from app.models.organization import (
    OrganizationProfile,
    SalaryComponentDef,
    WorkLocation,
)
from app.models.user import Role, User
from app.schemas.organization import (
    InviteUserRequest,
    OrganizationProfileUpdate,
    PayScheduleUpdate,
    SalaryComponentCreate,
    SalaryComponentUpdate,
    WorkLocationCreate,
    WorkLocationUpdate,
)


# ────────────────────── Organisation profile ──────────────────────


def get_profile(db: Session) -> OrganizationProfile:
    profile = db.get(OrganizationProfile, 1)
    if profile is None:
        profile = OrganizationProfile(id=1)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def update_profile(
    db: Session, payload: OrganizationProfileUpdate, *, actor: Optional[User] = None
) -> OrganizationProfile:
    profile = get_profile(db)
    data = payload.model_dump(exclude_unset=True)
    before = {k: getattr(profile, k) for k in data.keys()}
    for k, v in data.items():
        setattr(profile, k, v)
    record_audit(
        db,
        actor=actor,
        action="settings.organisation.update",
        entity="organization_profile",
        entity_id=profile.id,
        before=before,
        after=data,
    )
    db.commit()
    db.refresh(profile)
    return profile


def set_profile_logo(
    db: Session, logo_value: Optional[str], *, actor: Optional[User] = None
) -> OrganizationProfile:
    """Store the company logo on the singleton profile. We avoid logging the
    full data URL in audit (it can be hundreds of KB)."""
    profile = get_profile(db)
    profile.logo_key = logo_value
    record_audit(
        db,
        actor=actor,
        action="settings.organisation.logo." + ("set" if logo_value else "clear"),
        entity="organization_profile",
        entity_id=profile.id,
        before=None,
        after={"has_logo": bool(logo_value)},
    )
    db.commit()
    db.refresh(profile)
    return profile


# ────────────────────── Work locations ──────────────────────


def list_work_locations(db: Session) -> List[WorkLocation]:
    return list(
        db.scalars(
            select(WorkLocation).order_by(WorkLocation.is_primary.desc(), WorkLocation.name.asc())
        )
    )


def create_work_location(
    db: Session, payload: WorkLocationCreate, *, actor: Optional[User] = None
) -> WorkLocation:
    if payload.is_primary:
        # Only one primary at a time.
        db.execute(update(WorkLocation).values(is_primary=False))
    loc = WorkLocation(**payload.model_dump())
    db.add(loc)
    db.flush()
    record_audit(
        db,
        actor=actor,
        action="settings.work_location.create",
        entity="work_locations",
        entity_id=loc.id,
        after=payload.model_dump(),
    )
    db.commit()
    db.refresh(loc)
    return loc


def update_work_location(
    db: Session,
    location_id: int,
    payload: WorkLocationUpdate,
    *,
    actor: Optional[User] = None,
) -> WorkLocation:
    loc = db.get(WorkLocation, location_id)
    if loc is None:
        raise NotFoundError("Work location not found")
    data = payload.model_dump(exclude_unset=True)
    if data.get("is_primary"):
        db.execute(
            update(WorkLocation).where(WorkLocation.id != location_id).values(is_primary=False)
        )
    for k, v in data.items():
        setattr(loc, k, v)
    record_audit(
        db,
        actor=actor,
        action="settings.work_location.update",
        entity="work_locations",
        entity_id=loc.id,
        after=data,
    )
    db.commit()
    db.refresh(loc)
    return loc


def delete_work_location(
    db: Session, location_id: int, *, actor: Optional[User] = None
) -> None:
    loc = db.get(WorkLocation, location_id)
    if loc is None:
        raise NotFoundError("Work location not found")
    if loc.is_primary:
        raise ConflictError("Cannot delete the primary work location")
    record_audit(
        db,
        actor=actor,
        action="settings.work_location.delete",
        entity="work_locations",
        entity_id=loc.id,
        before={"name": loc.name},
    )
    db.delete(loc)
    db.commit()


# ────────────────────── Salary components ──────────────────────


def list_salary_components(
    db: Session, *, category: Optional[str] = None, employment_type: Optional[str] = None
) -> List[SalaryComponentDef]:
    stmt = select(SalaryComponentDef)
    if category:
        stmt = stmt.where(SalaryComponentDef.category == category.upper())
    if employment_type:
        stmt = stmt.where(SalaryComponentDef.employment_type == employment_type.upper())
    # Earnings first, then deductions; stable by name within each.
    return list(
        db.scalars(stmt.order_by(SalaryComponentDef.category.desc(), SalaryComponentDef.name))
    )


def create_salary_component(
    db: Session, payload: SalaryComponentCreate, *, actor: Optional[User] = None
) -> SalaryComponentDef:
    if db.scalar(
        select(SalaryComponentDef).where(
            SalaryComponentDef.employment_type == payload.employment_type,
            SalaryComponentDef.code == payload.code,
        )
    ):
        raise ConflictError(
            f"A component with code {payload.code} already exists for {payload.employment_type}"
        )
    comp = SalaryComponentDef(**payload.model_dump())
    db.add(comp)
    db.flush()
    record_audit(
        db,
        actor=actor,
        action="settings.salary_component.create",
        entity="salary_component_defs",
        entity_id=comp.id,
        after=payload.model_dump(),
    )
    db.commit()
    db.refresh(comp)
    return comp


def update_salary_component(
    db: Session,
    component_id: int,
    payload: SalaryComponentUpdate,
    *,
    actor: Optional[User] = None,
) -> SalaryComponentDef:
    comp = db.get(SalaryComponentDef, component_id)
    if comp is None:
        raise NotFoundError("Salary component not found")
    data = payload.model_dump(exclude_unset=True)
    if "code" in data and data["code"] != comp.code:
        if db.scalar(
            select(SalaryComponentDef).where(
                SalaryComponentDef.employment_type == comp.employment_type,
                SalaryComponentDef.code == data["code"],
            )
        ):
            raise ConflictError(f"A component with code {data['code']} already exists for this type")
    for k, v in data.items():
        setattr(comp, k, v)
    record_audit(
        db,
        actor=actor,
        action="settings.salary_component.update",
        entity="salary_component_defs",
        entity_id=comp.id,
        after=data,
    )
    db.commit()
    db.refresh(comp)
    return comp


def delete_salary_component(
    db: Session, component_id: int, *, actor: Optional[User] = None
) -> None:
    comp = db.get(SalaryComponentDef, component_id)
    if comp is None:
        raise NotFoundError("Salary component not found")
    record_audit(
        db,
        actor=actor,
        action="settings.salary_component.delete",
        entity="salary_component_defs",
        entity_id=comp.id,
        before={"code": comp.code, "name": comp.name},
    )
    db.delete(comp)
    db.commit()


# ────────────────────── Pay schedule ──────────────────────


def get_pay_schedule(db: Session) -> dict:
    p = get_profile(db)
    return {
        "work_week": list(p.work_week or []),
        "salary_calc_basis": p.salary_calc_basis,
        "org_working_days": p.org_working_days,
        "pay_day_type": p.pay_day_type,
        "pay_day": p.pay_day,
        "first_payroll_month": p.first_payroll_month,
        "lop_policy": getattr(p, "lop_policy", None) or "attendance",
    }


def update_pay_schedule(
    db: Session, payload: PayScheduleUpdate, *, actor: Optional[User] = None
) -> dict:
    p = get_profile(db)
    data = payload.model_dump(exclude_unset=True)
    if "work_week" in data and data["work_week"] is not None:
        ww = sorted({int(d) for d in data["work_week"] if 0 <= int(d) <= 6})
        if not ww:
            raise ConflictError("Work week must include at least one day")
        data["work_week"] = ww
    for k, v in data.items():
        setattr(p, k, v)
    record_audit(
        db,
        actor=actor,
        action="settings.pay_schedule.update",
        entity="organization_profile",
        entity_id=p.id,
        after=data,
    )
    db.commit()
    db.refresh(p)
    return get_pay_schedule(db)


# ────────────────────── Users & Roles ──────────────────────


def list_users(db: Session) -> List[dict]:
    rows = list(db.scalars(select(User).order_by(User.id.asc())))
    out: List[dict] = []
    for u in rows:
        emp_name: Optional[str] = None
        emp_code: Optional[str] = None
        if u.employee_id:
            emp = db.get(Employee, u.employee_id)
            if emp:
                emp_name = f"{emp.first_name} {emp.last_name}"
                emp_code = emp.employee_code
        out.append(
            {
                "id": u.id,
                "email": u.email,
                "role": u.role.name,
                "is_active": u.is_active,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
                "employee_id": u.employee_id,
                "employee_name": emp_name,
                "employee_code": emp_code,
            }
        )
    return out


def list_roles(db: Session) -> List[Role]:
    return list(db.scalars(select(Role).order_by(Role.id.asc())))


def _generate_temp_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in pw)
            and any(c.isupper() for c in pw)
            and any(c.isdigit() for c in pw)
            and any(c in "!@#$%&*" for c in pw)
        ):
            return pw


def invite_user(
    db: Session, payload: InviteUserRequest, *, actor: User
) -> dict:
    """Provision a user account with a generated initial password.

    Privilege check: the actor cannot grant a role greater than their own.
    """
    from app.models.enums import ROLE_RANK

    if ROLE_RANK[payload.role] > ROLE_RANK[actor.role.name]:
        raise ConflictError("You cannot grant a role higher than your own")

    email = payload.email.lower().strip()
    assert_email_domain_allowed(email)
    if db.scalar(select(User).where(User.email == email)):
        raise ConflictError(f"A user with email {email} already exists")

    # Resolve / create role row
    role_row = db.scalar(select(Role).where(Role.name == payload.role))
    if role_row is None:
        role_row = Role(name=payload.role, description=payload.role.value.title())
        db.add(role_row)
        db.flush()

    if payload.employee_id is not None:
        emp = db.get(Employee, payload.employee_id)
        if emp is None:
            raise NotFoundError("Employee not found")
        if db.scalar(select(User).where(User.employee_id == payload.employee_id)):
            raise ConflictError("This employee already has a login")

    initial_password = _generate_temp_password()
    user = User(
        email=email,
        hashed_password=hash_password(initial_password),
        role_id=role_row.id,
        employee_id=payload.employee_id,
        is_active=True,
    )
    db.add(user)
    db.flush()

    record_audit(
        db,
        actor=actor,
        action="user.invite",
        entity="users",
        entity_id=user.id,
        after={"email": email, "role": payload.role.value, "employee_id": payload.employee_id},
    )
    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "email": user.email,
        "role": payload.role,
        "initial_password": initial_password,
    }


def set_user_active(
    db: Session, user_id: int, *, active: bool, actor: User
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found")
    if user.id == actor.id and not active:
        raise ConflictError("You cannot deactivate your own account")
    user.is_active = active
    record_audit(
        db,
        actor=actor,
        action="user.activate" if active else "user.deactivate",
        entity="users",
        entity_id=user.id,
        after={"is_active": active},
    )
    db.commit()
    db.refresh(user)
    return user
