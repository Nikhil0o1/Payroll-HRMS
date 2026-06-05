"""Attendance regularization workflow."""
from __future__ import annotations

from datetime import datetime
from typing import Optional, Tuple

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import record_audit
from app.core.exceptions import ConflictError, DomainError, NotFoundError
from app.core.pagination import PageParams, paginate
from app.core.time import utcnow_naive
from app.models.attendance import AttendanceLog
from app.models.employee import Employee
from app.models.enums import (
    PunchSource,
    PunchType,
    RegularizationStatus,
    RegularizationType,
)
from app.models.regularization import RegularizationRequest
from app.models.user import User
from app.schemas.regularization import RegularizationCreate, RegularizationDecision
from app.services import attendance_service


def submit(
    db: Session, *, employee_id: int, payload: RegularizationCreate, actor: Optional[User] = None
) -> RegularizationRequest:
    if attendance_service._month_locked(db, payload.work_date):
        raise DomainError("Payroll for that month is locked; regularization not allowed.", status_code=409)

    req = RegularizationRequest(
        employee_id=employee_id,
        work_date=payload.work_date,
        type=payload.type,
        requested_in=payload.requested_in,
        requested_out=payload.requested_out,
        reason=payload.reason,
        status=RegularizationStatus.PENDING,
    )
    db.add(req)
    db.flush()
    record_audit(
        db,
        actor=actor,
        action="regularization.submit",
        entity="regularization_requests",
        entity_id=req.id,
        after={
            "work_date": str(req.work_date),
            "type": req.type.value,
            "requested_in": req.requested_in.isoformat() if req.requested_in else None,
            "requested_out": req.requested_out.isoformat() if req.requested_out else None,
        },
    )
    db.commit()
    db.refresh(req)
    return req


def _apply_to_logs(db: Session, req: RegularizationRequest, actor: User) -> None:
    """Insert/replace punches and recompute the day."""
    if req.requested_in:
        db.add(
            AttendanceLog(
                employee_id=req.employee_id,
                timestamp=req.requested_in,
                type=PunchType.IN,
                source=PunchSource.REGULARIZATION,
                created_by_user_id=actor.id,
                note=f"Regularized (req#{req.id})",
            )
        )
    if req.requested_out:
        db.add(
            AttendanceLog(
                employee_id=req.employee_id,
                timestamp=req.requested_out,
                type=PunchType.OUT,
                source=PunchSource.REGULARIZATION,
                created_by_user_id=actor.id,
                note=f"Regularized (req#{req.id})",
            )
        )
    db.flush()
    attendance_service.recompute_daily(db, req.employee_id, req.work_date)


def _decide(
    db: Session, request_id: int, *, approve: bool, decision_note: Optional[str], actor: User
) -> RegularizationRequest:
    req = db.get(RegularizationRequest, request_id)
    if not req:
        raise NotFoundError("Regularization request not found")
    if req.status != RegularizationStatus.PENDING:
        raise ConflictError(f"Request already {req.status.value.lower()}")
    if attendance_service._month_locked(db, req.work_date):
        raise DomainError("Payroll for that month is locked.", status_code=409)

    req.status = RegularizationStatus.APPROVED if approve else RegularizationStatus.REJECTED
    req.reviewer_user_id = actor.id
    req.decided_at = utcnow_naive()
    req.decision_note = decision_note

    if approve:
        _apply_to_logs(db, req, actor)

    record_audit(
        db,
        actor=actor,
        action=f"regularization.{'approve' if approve else 'reject'}",
        entity="regularization_requests",
        entity_id=req.id,
        after={"status": req.status.value, "decision_note": decision_note},
    )
    db.commit()
    db.refresh(req)
    return req


def approve(db: Session, request_id: int, payload: RegularizationDecision, actor: User) -> RegularizationRequest:
    return _decide(db, request_id, approve=True, decision_note=payload.decision_note, actor=actor)


def reject(db: Session, request_id: int, payload: RegularizationDecision, actor: User) -> RegularizationRequest:
    return _decide(db, request_id, approve=False, decision_note=payload.decision_note, actor=actor)


def list_requests(
    db: Session,
    params: PageParams,
    *,
    employee_id: Optional[int] = None,
    status: Optional[RegularizationStatus] = None,
    manager_user: Optional[User] = None,
    privileged: bool = False,
) -> Tuple[list[RegularizationRequest], int]:
    stmt = select(RegularizationRequest).options(
        selectinload(RegularizationRequest.employee)
    )
    if employee_id is not None:
        stmt = stmt.where(RegularizationRequest.employee_id == employee_id)
    elif manager_user and not privileged:
        scope = select(Employee.id).where(
            or_(
                Employee.manager_id == manager_user.employee_id,
                Employee.id == manager_user.employee_id,
            )
        )
        stmt = stmt.where(RegularizationRequest.employee_id.in_(scope))
    if status:
        stmt = stmt.where(RegularizationRequest.status == status)
    stmt = stmt.order_by(RegularizationRequest.created_at.desc(), RegularizationRequest.id.desc())
    return paginate(db, stmt, params)
