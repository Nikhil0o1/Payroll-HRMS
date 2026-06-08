"""Leave: types, balances, requests, approval workflow."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional, Tuple

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import record_audit
from app.core.config import settings
from app.core.exceptions import ConflictError, DomainError, NotFoundError
from app.core.pagination import PageParams, paginate
from app.core.time import utcnow_naive
from app.models.employee import Employee
from app.models.enums import LeaveStatus, PayrollStatus
from app.models.leave import LeaveBalance, LeaveRequest, LeaveType
from app.models.payroll import PayrollRun
from app.models.user import User
from app.schemas.leave import (
    LeaveDecision,
    LeaveRequestCreate,
    LeaveTypeCreate,
    LeaveTypeUpdate,
)
from app.services import attendance_service


# ---------- Types ----------
def list_types(db: Session) -> list[LeaveType]:
    return list(db.scalars(select(LeaveType).order_by(LeaveType.code)))


def create_type(db: Session, payload: LeaveTypeCreate, actor: Optional[User] = None) -> LeaveType:
    code = payload.code.upper().strip()
    if db.scalar(select(LeaveType).where(LeaveType.code == code)):
        raise ConflictError(f"Leave type {code} already exists")
    lt = LeaveType(
        code=code,
        name=payload.name,
        default_annual_quota=payload.default_annual_quota,
        is_paid=payload.is_paid,
        color=payload.color,
    )
    db.add(lt)
    db.flush()
    record_audit(db, actor=actor, action="leave_type.create", entity="leave_types", entity_id=lt.id, after=payload.model_dump())
    db.commit()
    db.refresh(lt)
    return lt


def update_type(db: Session, type_id: int, payload: LeaveTypeUpdate, actor: Optional[User] = None) -> LeaveType:
    lt = db.get(LeaveType, type_id)
    if not lt:
        raise NotFoundError("Leave type not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(lt, k, v)
    record_audit(db, actor=actor, action="leave_type.update", entity="leave_types", entity_id=lt.id, after=data)
    db.commit()
    db.refresh(lt)
    return lt


def delete_type(db: Session, type_id: int, actor: Optional[User] = None) -> None:
    """Delete a leave type. Refuses if any leave requests reference it
    (history must be preserved). Cascade-deletes empty leave balances so an
    admin can clean up bootstrap-seeded types that were never used."""
    lt = db.get(LeaveType, type_id)
    if not lt:
        raise NotFoundError("Leave type not found")

    request_count = db.scalar(
        select(func.count(LeaveRequest.id)).where(LeaveRequest.leave_type_id == type_id)
    ) or 0
    if request_count > 0:
        raise ConflictError(
            f"Cannot delete '{lt.code}': {request_count} leave request(s) reference it. "
            "Leave history must be preserved."
        )

    # Safe to drop balances since none of them have associated history.
    db.execute(LeaveBalance.__table__.delete().where(LeaveBalance.leave_type_id == type_id))
    record_audit(
        db,
        actor=actor,
        action="leave_type.delete",
        entity="leave_types",
        entity_id=lt.id,
        before={"code": lt.code, "name": lt.name},
    )
    db.delete(lt)
    db.commit()


# ---------- Balances ----------
def ensure_balances_for_year(db: Session, employee_id: int, year: int) -> list[LeaveBalance]:
    types = list_types(db)
    rows: list[LeaveBalance] = []
    for lt in types:
        existing = db.scalar(
            select(LeaveBalance).where(
                LeaveBalance.employee_id == employee_id,
                LeaveBalance.leave_type_id == lt.id,
                LeaveBalance.year == year,
            )
        )
        if existing:
            rows.append(existing)
            continue
        bal = LeaveBalance(
            employee_id=employee_id,
            leave_type_id=lt.id,
            year=year,
            allotted=float(lt.default_annual_quota or 0),
            used=0,
            pending=0,
        )
        db.add(bal)
        rows.append(bal)
    db.flush()
    return rows


def get_balances(db: Session, employee_id: int, year: int) -> list[LeaveBalance]:
    rows = ensure_balances_for_year(db, employee_id, year)
    db.commit()
    # eager-load types for response
    return list(
        db.scalars(
            select(LeaveBalance)
            .options(selectinload(LeaveBalance.leave_type))
            .where(LeaveBalance.employee_id == employee_id, LeaveBalance.year == year)
            .order_by(LeaveBalance.leave_type_id)
        )
    )


def adjust_balance(
    db: Session,
    *,
    employee_id: int,
    leave_type_id: int,
    year: int,
    delta_allotted: float = 0,
    actor: Optional[User] = None,
) -> LeaveBalance:
    bal = db.scalar(
        select(LeaveBalance).where(
            LeaveBalance.employee_id == employee_id,
            LeaveBalance.leave_type_id == leave_type_id,
            LeaveBalance.year == year,
        )
    )
    if not bal:
        ensure_balances_for_year(db, employee_id, year)
        bal = db.scalar(
            select(LeaveBalance).where(
                LeaveBalance.employee_id == employee_id,
                LeaveBalance.leave_type_id == leave_type_id,
                LeaveBalance.year == year,
            )
        )
    before = float(bal.allotted)
    bal.allotted = float(bal.allotted) + float(delta_allotted)
    record_audit(
        db,
        actor=actor,
        action="leave_balance.adjust",
        entity="leave_balances",
        entity_id=bal.id,
        before={"allotted": before},
        after={"allotted": float(bal.allotted)},
    )
    db.commit()
    db.refresh(bal)
    return bal


# ---------- Requests ----------
def _calc_days(start: date, end: date, half_day: bool) -> float:
    if half_day:
        if start != end:
            raise DomainError("Half-day leave must be a single date.")
        return 0.5
    return float((end - start).days + 1)


def _overlap_exists(db: Session, employee_id: int, start: date, end: date, exclude_id: Optional[int] = None) -> bool:
    stmt = select(func.count(LeaveRequest.id)).where(
        LeaveRequest.employee_id == employee_id,
        LeaveRequest.status.in_([LeaveStatus.PENDING, LeaveStatus.APPROVED]),
        LeaveRequest.start_date <= end,
        LeaveRequest.end_date >= start,
    )
    if exclude_id is not None:
        stmt = stmt.where(LeaveRequest.id != exclude_id)
    return (db.scalar(stmt) or 0) > 0


def apply_leave(
    db: Session, *, employee_id: int, payload: LeaveRequestCreate, actor: Optional[User] = None
) -> LeaveRequest:
    # Can't book a day that's already over (server-side guard mirroring the UI).
    if payload.start_date < utcnow_naive().date():
        raise DomainError("Leave start date cannot be in the past.", status_code=400)
    days = _calc_days(payload.start_date, payload.end_date, payload.half_day)
    if _overlap_exists(db, employee_id, payload.start_date, payload.end_date):
        raise ConflictError("Overlapping leave already exists for this period.")

    # Validate balance + reserve as 'pending'
    year = payload.start_date.year
    ensure_balances_for_year(db, employee_id, year)
    bal = db.scalar(
        select(LeaveBalance).where(
            LeaveBalance.employee_id == employee_id,
            LeaveBalance.leave_type_id == payload.leave_type_id,
            LeaveBalance.year == year,
        )
    )
    if not bal:
        raise NotFoundError("Leave type not configured for this employee/year.")
    if float(bal.available) < days:
        raise DomainError(
            f"Insufficient leave balance. Available {bal.available}, requested {days}.",
            status_code=400,
        )
    bal.pending = float(bal.pending) + days

    req = LeaveRequest(
        employee_id=employee_id,
        leave_type_id=payload.leave_type_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days=days,
        half_day=payload.half_day,
        reason=payload.reason,
        status=LeaveStatus.PENDING,
    )
    db.add(req)
    db.flush()
    record_audit(
        db,
        actor=actor,
        action="leave.apply",
        entity="leave_requests",
        entity_id=req.id,
        after={
            "leave_type_id": req.leave_type_id,
            "start_date": str(req.start_date),
            "end_date": str(req.end_date),
            "days": float(req.days),
        },
    )
    db.commit()
    db.refresh(req)
    return req


def cancel_leave(db: Session, *, request_id: int, actor: User) -> LeaveRequest:
    req = db.get(LeaveRequest, request_id)
    if not req:
        raise NotFoundError("Leave request not found")
    if req.status not in (LeaveStatus.PENDING, LeaveStatus.APPROVED):
        raise ConflictError(f"Cannot cancel a {req.status.value} request")
    if req.status == LeaveStatus.APPROVED and req.start_date <= utcnow_naive().date():
        raise ConflictError("Cannot cancel a leave that has already started.")

    bal = db.scalar(
        select(LeaveBalance).where(
            LeaveBalance.employee_id == req.employee_id,
            LeaveBalance.leave_type_id == req.leave_type_id,
            LeaveBalance.year == req.start_date.year,
        )
    )
    if bal:
        if req.status == LeaveStatus.PENDING:
            bal.pending = max(0.0, float(bal.pending) - float(req.days))
        else:
            bal.used = max(0.0, float(bal.used) - float(req.days))

    req.status = LeaveStatus.CANCELLED
    req.decided_at = utcnow_naive()
    record_audit(db, actor=actor, action="leave.cancel", entity="leave_requests", entity_id=req.id)

    if req.status == LeaveStatus.CANCELLED:
        # Recompute affected days (so calendar reflects no leave)
        d = req.start_date
        while d <= req.end_date:
            attendance_service.recompute_daily(db, req.employee_id, d)
            d = d + timedelta(days=1)
    db.commit()
    db.refresh(req)
    return req


def _decide(
    db: Session, request_id: int, *, approve: bool, decision_note: Optional[str], actor: User
) -> LeaveRequest:
    req = db.get(LeaveRequest, request_id)
    if not req:
        raise NotFoundError("Leave request not found")
    if req.status != LeaveStatus.PENDING:
        raise ConflictError(f"Request already {req.status.value.lower()}")

    bal = db.scalar(
        select(LeaveBalance).where(
            LeaveBalance.employee_id == req.employee_id,
            LeaveBalance.leave_type_id == req.leave_type_id,
            LeaveBalance.year == req.start_date.year,
        )
    )
    if bal:
        bal.pending = max(0.0, float(bal.pending) - float(req.days))
        if approve:
            bal.used = float(bal.used) + float(req.days)

    req.status = LeaveStatus.APPROVED if approve else LeaveStatus.REJECTED
    req.approver_user_id = actor.id
    req.decided_at = utcnow_naive()
    req.decision_note = decision_note

    if approve:
        d = req.start_date
        while d <= req.end_date:
            attendance_service.recompute_daily(db, req.employee_id, d)
            d = d + timedelta(days=1)

    record_audit(
        db,
        actor=actor,
        action=f"leave.{'approve' if approve else 'reject'}",
        entity="leave_requests",
        entity_id=req.id,
        after={"status": req.status.value, "decision_note": decision_note},
    )
    db.commit()
    db.refresh(req)
    return req


def approve_leave(db: Session, request_id: int, payload: LeaveDecision, actor: User) -> LeaveRequest:
    return _decide(db, request_id, approve=True, decision_note=payload.decision_note, actor=actor)


def reject_leave(db: Session, request_id: int, payload: LeaveDecision, actor: User) -> LeaveRequest:
    return _decide(db, request_id, approve=False, decision_note=payload.decision_note, actor=actor)


def list_requests(
    db: Session,
    params: PageParams,
    *,
    employee_id: Optional[int] = None,
    status: Optional[LeaveStatus] = None,
    manager_user: Optional[User] = None,
    privileged: bool = False,
) -> Tuple[list[LeaveRequest], int]:
    stmt = select(LeaveRequest).options(
        selectinload(LeaveRequest.leave_type), selectinload(LeaveRequest.employee)
    )
    if employee_id is not None:
        stmt = stmt.where(LeaveRequest.employee_id == employee_id)
    elif manager_user and not privileged:
        # Manager: see direct reports + self
        scope_stmt = select(Employee.id).where(
            or_(
                Employee.manager_id == manager_user.employee_id,
                Employee.id == manager_user.employee_id,
            )
        )
        stmt = stmt.where(LeaveRequest.employee_id.in_(scope_stmt))
    if status:
        stmt = stmt.where(LeaveRequest.status == status)
    stmt = stmt.order_by(LeaveRequest.created_at.desc(), LeaveRequest.id.desc())
    return paginate(db, stmt, params)
