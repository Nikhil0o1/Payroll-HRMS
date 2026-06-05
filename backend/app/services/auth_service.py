"""Authentication: login, refresh, logout, password change."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.config import settings
from app.core.exceptions import ConflictError, DomainError, NotFoundError
from app.core.time import utcnow_naive
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    refresh_token_expiry,
    verify_password,
)
from app.models.enums import RoleName
from app.models.user import RefreshToken, Role, User


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _issue_tokens(db: Session, user: User) -> tuple[str, str]:
    """Create an access JWT and a fresh rotating refresh token."""
    access = create_access_token(
        subject=user.id,
        role=user.role.name.value,
        extra={"email": user.email, "employee_id": user.employee_id},
    )
    refresh = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh),
            expires_at=refresh_expiry_naive(),
            revoked=False,
        )
    )
    return access, refresh


def refresh_expiry_naive() -> datetime:
    return refresh_token_expiry().replace(tzinfo=None)


def signup_employee(
    db: Session,
    *,
    first_name: str,
    last_name: str,
    email: str,
    password: str,
    phone: Optional[str] = None,
    department: Optional[str] = None,
    designation: Optional[str] = None,
    date_of_joining: Optional[datetime] = None,
    ip: Optional[str] = None,
) -> tuple[User, str, str]:
    """Public self-serve signup. Provisions an EMPLOYEE-only account, creates
    the matching Employee + profile, seeds leave balances for the current year,
    and returns an authenticated token pair (auto-login).

    Admin/HR/Manager accounts can never be created here — they're created by
    existing admins from inside the app.
    """
    from datetime import date as _date

    from app.models.employee import Employee, EmployeeProfile
    from app.models.enums import EmployeeStatus, EmploymentType
    from app.services import employee_service, leave_service

    email = email.lower().strip()

    if db.scalar(select(User).where(User.email == email)):
        raise ConflictError("An account with this email already exists")
    if db.scalar(select(Employee).where(Employee.work_email == email)):
        raise ConflictError("An employee with this email already exists")

    role_row = get_or_create_role(db, RoleName.EMPLOYEE)

    emp = Employee(
        employee_code=employee_service._next_employee_code(db),
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        work_email=email,
        phone=phone,
        department=department,
        designation=designation,
        date_of_joining=date_of_joining or _date.today(),
        employment_type=EmploymentType.FULL_TIME,
        status=EmployeeStatus.ACTIVE,
    )
    db.add(emp)
    db.flush()
    db.add(EmployeeProfile(employee_id=emp.id, emergency_contacts=[]))

    user = User(
        email=email,
        hashed_password=hash_password(password),
        role_id=role_row.id,
        employee_id=emp.id,
        is_active=True,
    )
    db.add(user)
    db.flush()

    leave_service.ensure_balances_for_year(db, emp.id, _date.today().year)

    access, refresh = _issue_tokens(db, user)
    user.last_login_at = utcnow_naive()
    record_audit(
        db,
        actor=user,
        action="auth.signup",
        entity="users",
        entity_id=user.id,
        ip=ip,
        after={"email": email, "employee_id": emp.id, "role": RoleName.EMPLOYEE.value},
    )
    db.commit()
    db.refresh(user)
    return user, access, refresh


def _register_failed_login(db: Session, user: Optional[User], ip: Optional[str]) -> None:
    """Increment the failure counter and apply a temporary lock past the threshold."""
    if user is None or not settings.ACCOUNT_LOCKOUT_THRESHOLD:
        return
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    if user.failed_login_attempts >= settings.ACCOUNT_LOCKOUT_THRESHOLD:
        user.locked_until = utcnow_naive() + timedelta(minutes=settings.ACCOUNT_LOCKOUT_MINUTES)
        user.failed_login_attempts = 0
        record_audit(db, actor=None, action="auth.account_locked", entity="users", entity_id=user.id, ip=ip)
    db.commit()


def _cleanup_refresh_tokens(db: Session, user_id: int) -> None:
    """Opportunistically prune revoked/expired refresh tokens for a user."""
    db.execute(
        delete(RefreshToken).where(
            RefreshToken.user_id == user_id,
            or_(RefreshToken.revoked.is_(True), RefreshToken.expires_at < utcnow_naive()),
        )
    )


def authenticate(db: Session, email: str, password: str, ip: Optional[str] = None) -> tuple[User, str, str]:
    user = db.scalar(select(User).where(User.email == email.lower().strip()))

    # Temporary lockout after repeated failures (brute-force mitigation).
    if user and user.locked_until and user.locked_until > utcnow_naive():
        raise DomainError(
            "Account temporarily locked after repeated failed logins. Please try again later.",
            status_code=429,
        )

    if not user or not verify_password(password, user.hashed_password):
        _register_failed_login(db, user, ip)
        raise DomainError("Invalid email or password", status_code=401)
    if not user.is_active:
        raise DomainError("This account is inactive", status_code=403)

    # Success — reset counters and prune stale tokens.
    user.failed_login_attempts = 0
    user.locked_until = None
    _cleanup_refresh_tokens(db, user.id)
    access, refresh = _issue_tokens(db, user)
    user.last_login_at = utcnow_naive()
    record_audit(db, actor=user, action="auth.login", entity="users", entity_id=user.id, ip=ip)
    db.commit()
    db.refresh(user)
    return user, access, refresh


def rotate_refresh(db: Session, raw_refresh: str, ip: Optional[str] = None) -> tuple[User, str, str]:
    token_hash = hash_refresh_token(raw_refresh)
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if not rt or rt.revoked:
        raise DomainError("Invalid refresh token", status_code=401)
    if rt.expires_at < utcnow_naive():
        rt.revoked = True
        db.commit()
        raise DomainError("Refresh token expired", status_code=401)

    user = db.get(User, rt.user_id)
    if not user or not user.is_active:
        raise DomainError("User no longer active", status_code=403)

    rt.revoked = True  # rotate
    access, new_refresh = _issue_tokens(db, user)
    record_audit(db, actor=user, action="auth.refresh", entity="users", entity_id=user.id, ip=ip)
    db.commit()
    return user, access, new_refresh


def logout(db: Session, raw_refresh: Optional[str], user: Optional[User], ip: Optional[str] = None) -> None:
    if raw_refresh:
        rt = db.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_refresh))
        )
        if rt:
            rt.revoked = True
    if user:
        record_audit(db, actor=user, action="auth.logout", entity="users", entity_id=user.id, ip=ip)
    db.commit()


def change_password(
    db: Session, user: User, current_password: str, new_password: str, ip: Optional[str] = None
) -> None:
    if not verify_password(current_password, user.hashed_password):
        raise DomainError("Current password is incorrect", status_code=400)
    if current_password == new_password:
        raise DomainError("New password must differ from current password", status_code=400)
    user.hashed_password = hash_password(new_password)
    # Revoke all refresh tokens
    for rt in user.refresh_tokens:
        rt.revoked = True
    record_audit(db, actor=user, action="auth.password_change", entity="users", entity_id=user.id, ip=ip)
    db.commit()


def get_or_create_role(db: Session, name: RoleName, description: Optional[str] = None) -> Role:
    role = db.scalar(select(Role).where(Role.name == name))
    if role:
        return role
    role = Role(name=name, description=description or name.value.replace("_", " ").title())
    db.add(role)
    db.flush()
    return role


def create_user(
    db: Session,
    *,
    email: str,
    password: str,
    role: RoleName,
    employee_id: Optional[int] = None,
    actor: Optional[User] = None,
) -> User:
    email = email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise ConflictError(f"User with email {email} already exists")
    role_row = get_or_create_role(db, role)
    user = User(
        email=email,
        hashed_password=hash_password(password),
        role_id=role_row.id,
        employee_id=employee_id,
        is_active=True,
    )
    db.add(user)
    db.flush()
    record_audit(
        db,
        actor=actor,
        action="user.create",
        entity="users",
        entity_id=user.id,
        after={"email": email, "role": role.value, "employee_id": employee_id},
    )
    return user
