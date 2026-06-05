"""Attendance endpoints."""
from __future__ import annotations

from datetime import date as _date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.time import utcnow_naive
from app.core.deps import (
    ensure_self_or_privileged,
    get_current_user,
    is_privileged,
    require_hr,
)
from app.models.enums import PunchSource
from app.models.user import User
from app.schemas.attendance import (
    AdminPunchCreate,
    AttendanceDailyOut,
    AttendanceLogOut,
    AttendanceSummary,
    PunchRequest,
    TodayStatus,
)
from app.services import attendance_service

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _require_employee(user: User) -> int:
    if user.employee_id is None:
        raise HTTPException(status_code=400, detail="This account has no linked employee record")
    return user.employee_id


@router.post("/punch", response_model=AttendanceLogOut)
def punch(
    payload: PunchRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)
) -> AttendanceLogOut:
    emp_id = _require_employee(current)
    log = attendance_service.punch(
        db,
        employee_id=emp_id,
        punch_type=payload.type,
        when=payload.timestamp,
        source=PunchSource.WEB,
        note=payload.note,
        actor=current,
    )
    return AttendanceLogOut.model_validate(log)


@router.get("/today", response_model=TodayStatus)
def today(
    employee_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> TodayStatus:
    emp_id = employee_id or _require_employee(current)
    ensure_self_or_privileged(current, emp_id)
    return attendance_service.today_status(db, employee_id=emp_id)


@router.get("/logs", response_model=list[AttendanceLogOut])
def list_logs(
    employee_id: Optional[int] = None,
    period_start: Optional[_date] = None,
    period_end: Optional[_date] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[AttendanceLogOut]:
    emp_id = employee_id or _require_employee(current)
    ensure_self_or_privileged(current, emp_id)
    today_d = utcnow_naive().date()
    start = period_start or today_d.replace(day=1)
    end = period_end or today_d
    rows = attendance_service.list_logs(
        db, employee_id=emp_id, period_start=start, period_end=end
    )
    return [AttendanceLogOut.model_validate(r) for r in rows]


@router.get("/month", response_model=list[AttendanceDailyOut])
def month(
    year: int,
    month: int,
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[AttendanceDailyOut]:
    emp_id = employee_id or _require_employee(current)
    ensure_self_or_privileged(current, emp_id)
    rows = attendance_service.month_view(db, employee_id=emp_id, year=year, month=month)
    return [AttendanceDailyOut.model_validate(r) for r in rows]


@router.get("/summary", response_model=AttendanceSummary)
def summary(
    period_start: _date,
    period_end: _date,
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> AttendanceSummary:
    emp_id = employee_id or _require_employee(current)
    ensure_self_or_privileged(current, emp_id)
    return attendance_service.summary(
        db, employee_id=emp_id, period_start=period_start, period_end=period_end
    )


@router.post("/admin-punch", response_model=AttendanceLogOut)
def admin_punch(
    payload: AdminPunchCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
) -> AttendanceLogOut:
    log = attendance_service.punch(
        db,
        employee_id=payload.employee_id,
        punch_type=payload.type,
        when=payload.timestamp,
        source=PunchSource.IMPORT,
        note=payload.note,
        actor=current,
    )
    return AttendanceLogOut.model_validate(log)
