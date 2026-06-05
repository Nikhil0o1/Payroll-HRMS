"""Employee CRUD, profile, and code generation."""
from __future__ import annotations

import logging
import secrets
import string
from datetime import date
from typing import Optional, Tuple

from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import record_audit
from app.core.exceptions import ConflictError, NotFoundError
from app.core.pagination import PageParams, paginate
from app.models.employee import Employee, EmployeeProfile
from app.models.enums import EmployeeStatus, RoleName
from app.models.user import User
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeProfileUpdate,
    EmployeeUpdate,
)
from app.services import auth_service, email_service
from app.services.email_templates import welcome_employee as welcome_employee_tpl

log = logging.getLogger("hrms.employee")


def _generate_temp_password(length: int = 14) -> str:
    """Generate a strong random password with at least one of each class.

    Avoids visually-ambiguous characters (0/O/1/l/I) to make read-and-type
    from the welcome email less error-prone.
    """
    lowers = "abcdefghijkmnopqrstuvwxyz"
    uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    digits = "23456789"
    symbols = "!@#$%^&*?"
    required = [
        secrets.choice(lowers),
        secrets.choice(uppers),
        secrets.choice(digits),
        secrets.choice(symbols),
    ]
    pool = lowers + uppers + digits + symbols
    rest = [secrets.choice(pool) for _ in range(max(0, length - len(required)))]
    chars = required + rest
    # Cryptographically shuffle
    for i in range(len(chars) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        chars[i], chars[j] = chars[j], chars[i]
    return "".join(chars)


def _next_employee_code(db: Session) -> str:
    last = db.scalar(select(Employee.employee_code).order_by(desc(Employee.id)).limit(1))
    if last and last.startswith("EMP"):
        try:
            n = int(last[3:]) + 1
            return f"EMP{n:04d}"
        except ValueError:
            pass
    count = db.scalar(select(func.count(Employee.id))) or 0
    return f"EMP{count + 1:04d}"


def get(db: Session, employee_id: int) -> Employee:
    emp = db.get(Employee, employee_id)
    if not emp:
        raise NotFoundError(f"Employee {employee_id} not found")
    return emp


def get_with_profile(db: Session, employee_id: int) -> Employee:
    emp = db.execute(
        select(Employee).options(selectinload(Employee.profile)).where(Employee.id == employee_id)
    ).scalar_one_or_none()
    if not emp:
        raise NotFoundError(f"Employee {employee_id} not found")
    return emp


def list_employees(
    db: Session,
    params: PageParams,
    *,
    department: Optional[str] = None,
    status: Optional[EmployeeStatus] = None,
    manager_id: Optional[int] = None,
) -> Tuple[list[Employee], int]:
    stmt = select(Employee)
    if department:
        stmt = stmt.where(Employee.department == department)
    if status:
        stmt = stmt.where(Employee.status == status)
    if manager_id is not None:
        stmt = stmt.where(Employee.manager_id == manager_id)
    if params.q:
        like = f"%{params.q}%"
        stmt = stmt.where(
            or_(
                Employee.first_name.ilike(like),
                Employee.last_name.ilike(like),
                Employee.employee_code.ilike(like),
                Employee.work_email.ilike(like),
                Employee.department.ilike(like),
                Employee.designation.ilike(like),
            )
        )
    stmt = stmt.order_by(Employee.id.desc())
    return paginate(db, stmt, params)


def create_employee(db: Session, payload: EmployeeCreate, actor: Optional[User] = None) -> Employee:
    # Unique work email
    if db.scalar(select(Employee).where(Employee.work_email == payload.work_email)):
        raise ConflictError(f"An employee with email {payload.work_email} already exists")
    code = payload.employee_code or _next_employee_code(db)
    if db.scalar(select(Employee).where(Employee.employee_code == code)):
        raise ConflictError(f"Employee code {code} already exists")

    emp = Employee(
        employee_code=code,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        work_email=payload.work_email.lower(),
        personal_email=payload.personal_email.lower() if payload.personal_email else None,
        phone=payload.phone,
        date_of_joining=payload.date_of_joining,
        date_of_exit=payload.date_of_exit,
        department=payload.department,
        designation=payload.designation,
        manager_id=payload.manager_id,
        employment_type=payload.employment_type,
        status=payload.status,
    )
    db.add(emp)
    db.flush()
    db.add(EmployeeProfile(employee_id=emp.id, emergency_contacts=[]))

    initial_password: Optional[str] = None
    if payload.create_user:
        # Use admin-supplied password if provided, otherwise generate a strong
        # one. Either way, send it to the new employee via email so they can
        # actually log in.
        initial_password = payload.initial_password or _generate_temp_password()
        auth_service.create_user(
            db,
            email=payload.work_email,
            password=initial_password,
            role=payload.role,
            employee_id=emp.id,
            actor=actor,
        )

    record_audit(
        db,
        actor=actor,
        action="employee.create",
        entity="employees",
        entity_id=emp.id,
        after={
            "employee_code": emp.employee_code,
            "name": emp.full_name,
            "work_email": emp.work_email,
            "department": emp.department,
            "status": emp.status.value,
        },
    )
    db.commit()
    db.refresh(emp)

    # Fire welcome email *after* commit. We never let an email failure roll
    # back the employee row — send_email already swallows exceptions.
    if payload.create_user and initial_password:
        subject, html, text = welcome_employee_tpl(
            first_name=emp.first_name,
            work_email=emp.work_email,
            initial_password=initial_password,
            employee_code=emp.employee_code,
        )
        delivered = email_service.send_email(
            to=emp.work_email, subject=subject, html=html, text=text
        )
        if not delivered:
            log.warning(
                "Welcome email could not be delivered to %s (employee_code=%s). "
                "Share credentials with the employee out-of-band.",
                emp.work_email,
                emp.employee_code,
            )
    return emp


def update_employee(
    db: Session, employee_id: int, payload: EmployeeUpdate, actor: Optional[User] = None
) -> Employee:
    emp = get(db, employee_id)
    before = {
        "first_name": emp.first_name,
        "last_name": emp.last_name,
        "department": emp.department,
        "designation": emp.designation,
        "status": emp.status.value,
        "manager_id": emp.manager_id,
        "employment_type": emp.employment_type.value,
    }
    data = payload.model_dump(exclude_unset=True)
    if "work_email" in data and data["work_email"]:
        data["work_email"] = data["work_email"].lower()
        existing = db.scalar(
            select(Employee).where(Employee.work_email == data["work_email"], Employee.id != employee_id)
        )
        if existing:
            raise ConflictError("Another employee already uses that work email")
    if data.get("manager_id") == employee_id:
        raise ConflictError("An employee cannot manage themselves")
    for k, v in data.items():
        setattr(emp, k, v)

    after = {k: getattr(emp, k) for k in before.keys()}
    after["status"] = emp.status.value
    after["employment_type"] = emp.employment_type.value
    record_audit(
        db,
        actor=actor,
        action="employee.update",
        entity="employees",
        entity_id=emp.id,
        before=before,
        after=after,
    )
    db.commit()
    db.refresh(emp)
    return emp


def deactivate(db: Session, employee_id: int, actor: Optional[User] = None) -> Employee:
    emp = get(db, employee_id)
    if emp.status == EmployeeStatus.INACTIVE:
        return emp
    emp.status = EmployeeStatus.INACTIVE
    if not emp.date_of_exit:
        emp.date_of_exit = date.today()
    if emp.user:
        emp.user.is_active = False
        for rt in emp.user.refresh_tokens:
            rt.revoked = True
    record_audit(
        db,
        actor=actor,
        action="employee.deactivate",
        entity="employees",
        entity_id=emp.id,
        after={"status": "INACTIVE", "date_of_exit": str(emp.date_of_exit)},
    )
    db.commit()
    db.refresh(emp)
    return emp


def reactivate(db: Session, employee_id: int, actor: Optional[User] = None) -> Employee:
    emp = get(db, employee_id)
    emp.status = EmployeeStatus.ACTIVE
    emp.date_of_exit = None
    if emp.user:
        emp.user.is_active = True
    record_audit(db, actor=actor, action="employee.reactivate", entity="employees", entity_id=emp.id)
    db.commit()
    db.refresh(emp)
    return emp


def update_profile(
    db: Session, employee_id: int, payload: EmployeeProfileUpdate, actor: Optional[User] = None
) -> EmployeeProfile:
    emp = get_with_profile(db, employee_id)
    profile = emp.profile
    if not profile:
        profile = EmployeeProfile(employee_id=emp.id, emergency_contacts=[])
        db.add(profile)
        db.flush()
    data = payload.model_dump(exclude_unset=True)
    if "emergency_contacts" in data and data["emergency_contacts"] is not None:
        data["emergency_contacts"] = [c.model_dump() if hasattr(c, "model_dump") else c for c in data["emergency_contacts"]]
    before = {
        k: getattr(profile, k)
        for k in (
            "date_of_birth",
            "gender",
            "address",
            "bank_account_no",
            "bank_ifsc",
            "bank_name",
            "pan",
        )
    }
    for k, v in data.items():
        setattr(profile, k, v)
    record_audit(
        db,
        actor=actor,
        action="employee.profile_update",
        entity="employee_profiles",
        entity_id=profile.id,
        before={str(k): str(v) if v is not None else None for k, v in before.items()},
        after={k: data.get(k) for k in before.keys() if k in data},
    )
    db.commit()
    db.refresh(profile)
    return profile


# ---------- Bulk import ----------
IMPORT_COLUMNS = [
    "first_name",
    "last_name",
    "work_email",
    "department",
    "designation",
    "date_of_joining",
    "employment_type",
    "annual_ctc",
]


def _standard_salary_components(monthly_ctc: float):
    """Derive a realistic CTC breakdown (Basic/HRA/Conveyance/Special + PF/PT)
    so imported employees produce multi-component payslips — which is what
    makes the payroll-cost chart show real, multi-shade bars."""
    from app.schemas.payroll import SalaryComponent

    basic = round(0.40 * monthly_ctc, 2)
    hra = round(0.40 * basic, 2)
    conveyance = 1600.0 if monthly_ctc > 8000 else 0.0
    special = round(max(0.0, monthly_ctc - basic - hra - conveyance), 2)
    comps = [SalaryComponent(code="HRA", name="House Rent Allowance", type="EARNING", calc="PERCENT_OF_BASIC", value=40)]
    if conveyance:
        comps.append(SalaryComponent(code="CONVEYANCE", name="Conveyance Allowance", type="EARNING", calc="FIXED", value=conveyance))
    comps += [
        SalaryComponent(code="SPECIAL", name="Special Allowance", type="EARNING", calc="FIXED", value=special),
        SalaryComponent(code="PF", name="Provident Fund", type="DEDUCTION", calc="PERCENT_OF_BASIC", value=12),
        SalaryComponent(code="PT", name="Professional Tax", type="DEDUCTION", calc="FIXED", value=200),
    ]
    return basic, comps


def bulk_import_employees(
    db: Session, rows: list[dict], actor: Optional[User] = None, *, send_invites: bool = False
) -> dict:
    """Create many employees from parsed CSV rows. Each row may carry an
    `annual_ctc` to auto-provision a salary structure. Per-row failures are
    collected and reported; they don't abort the whole import."""
    from datetime import date as _date

    from app.models.enums import EmploymentType, RoleName
    from app.schemas.employee import EmployeeCreate
    from app.schemas.payroll import SalaryStructureCreate
    from app.services import payroll_service

    created = 0
    failed: list[dict] = []
    for idx, row in enumerate(rows, start=2):  # header is line 1
        email = (row.get("work_email") or "").strip()
        try:
            first = (row.get("first_name") or "").strip()
            last = (row.get("last_name") or "").strip()
            if not first or not last or not email:
                raise ValueError("first_name, last_name and work_email are required")

            doj_raw = (row.get("date_of_joining") or "").strip()
            doj = _date.fromisoformat(doj_raw) if doj_raw else _date.today()

            try:
                et = EmploymentType((row.get("employment_type") or "FULL_TIME").strip().upper())
            except ValueError:
                et = EmploymentType.FULL_TIME

            payload = EmployeeCreate(
                first_name=first,
                last_name=last,
                work_email=email,
                department=(row.get("department") or None),
                designation=(row.get("designation") or None),
                date_of_joining=doj,
                employment_type=et,
                create_user=send_invites,
                role=RoleName.EMPLOYEE,
            )
            emp = create_employee(db, payload, actor=actor)

            ctc_raw = (row.get("annual_ctc") or "").strip().replace(",", "").replace("₹", "")
            if ctc_raw:
                ctc = float(ctc_raw)
                if ctc > 0:
                    basic, comps = _standard_salary_components(ctc / 12.0)
                    payroll_service.create_structure(
                        db,
                        SalaryStructureCreate(
                            employee_id=emp.id,
                            effective_from=doj,
                            ctc_annual=ctc,
                            basic_monthly=basic,
                            components=comps,
                        ),
                        actor=actor,
                    )
            created += 1
        except Exception as exc:  # noqa: BLE001 — collect & continue
            db.rollback()
            failed.append({"row": idx, "email": email, "error": str(exc)[:200]})
    return {"total": len(rows), "created": created, "failed": failed}
