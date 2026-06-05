"""Attendance domain logic.

The system stores raw immutable punch logs and *derives* a daily projection
(`AttendanceDaily`) on demand. The daily projection is a cache that can always
be recomputed — except when frozen by a locked payroll run.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Iterable, Optional

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.config import settings
from app.core.exceptions import ConflictError, DomainError, NotFoundError
from app.core.time import utcnow_naive
from app.models.attendance import AttendanceDaily, AttendanceLog
from app.models.employee import Employee
from app.models.enums import (
    AttendanceStatus,
    LeaveStatus,
    PayrollStatus,
    PunchSource,
    PunchType,
)
from app.models.holiday import Holiday
from app.models.leave import LeaveRequest
from app.models.payroll import PayrollRun
from app.models.user import User
from app.schemas.attendance import AttendanceSummary, TodayStatus


# ---------------- Helpers ----------------
def _parse_workday_start() -> time:
    h, m = (int(x) for x in settings.WORKDAY_START.split(":"))
    return time(hour=h, minute=m)


def _is_weekend(d: date) -> bool:
    return d.weekday() in settings.WEEKEND_DAYS


def _month_locked(db: Session, day: date) -> bool:
    run = db.scalar(
        select(PayrollRun).where(
            PayrollRun.period_year == day.year,
            PayrollRun.period_month == day.month,
            PayrollRun.status == PayrollStatus.LOCKED,
        )
    )
    return run is not None


# ---------------- Punch ----------------
def punch(
    db: Session,
    *,
    employee_id: int,
    punch_type: PunchType,
    when: Optional[datetime] = None,
    source: PunchSource = PunchSource.WEB,
    note: Optional[str] = None,
    actor: Optional[User] = None,
) -> AttendanceLog:
    when = when or utcnow_naive()
    work_date = when.date()
    if _month_locked(db, work_date):
        raise DomainError("Payroll for this month is locked; attendance cannot be modified.", status_code=409)

    last = db.scalar(
        select(AttendanceLog)
        .where(AttendanceLog.employee_id == employee_id, func.date(AttendanceLog.timestamp) == work_date)
        .order_by(AttendanceLog.timestamp.desc())
        .limit(1)
    )
    if last and last.type == punch_type:
        raise ConflictError(
            f"Cannot punch {punch_type.value} — last punch was already {punch_type.value} at "
            f"{last.timestamp.strftime('%H:%M')}."
        )
    if punch_type == PunchType.OUT and (last is None or last.type != PunchType.IN):
        raise ConflictError("Cannot punch OUT before punching IN.")

    log = AttendanceLog(
        employee_id=employee_id,
        timestamp=when,
        type=punch_type,
        source=source,
        created_by_user_id=actor.id if actor else None,
        note=note,
    )
    db.add(log)
    db.flush()
    recompute_daily(db, employee_id, work_date)
    record_audit(
        db,
        actor=actor,
        action=f"attendance.punch_{punch_type.value.lower()}",
        entity="attendance_logs",
        entity_id=log.id,
        after={"employee_id": employee_id, "timestamp": when.isoformat(), "source": source.value},
    )
    db.commit()
    db.refresh(log)
    return log


# ---------------- Daily projection ----------------
def _daily_for(db: Session, employee_id: int, day: date) -> AttendanceDaily:
    row = db.scalar(
        select(AttendanceDaily).where(
            AttendanceDaily.employee_id == employee_id, AttendanceDaily.work_date == day
        )
    )
    if row:
        return row
    row = AttendanceDaily(employee_id=employee_id, work_date=day, status=AttendanceStatus.ABSENT)
    db.add(row)
    db.flush()
    return row


def _is_on_leave(db: Session, employee_id: int, day: date) -> bool:
    return db.scalar(
        select(func.count(LeaveRequest.id)).where(
            LeaveRequest.employee_id == employee_id,
            LeaveRequest.status == LeaveStatus.APPROVED,
            LeaveRequest.start_date <= day,
            LeaveRequest.end_date >= day,
        )
    ) > 0


def _is_holiday(db: Session, day: date) -> bool:
    return db.scalar(select(func.count(Holiday.id)).where(Holiday.date == day)) > 0


def recompute_daily(db: Session, employee_id: int, day: date) -> AttendanceDaily:
    """Rebuild the day's projection from raw logs + leave/holiday context."""
    row = _daily_for(db, employee_id, day)
    if row.is_locked:
        return row

    logs: list[AttendanceLog] = list(
        db.scalars(
            select(AttendanceLog)
            .where(
                AttendanceLog.employee_id == employee_id,
                func.date(AttendanceLog.timestamp) == day,
            )
            .order_by(AttendanceLog.timestamp.asc())
        )
    )

    worked = 0
    pending_in: Optional[datetime] = None
    has_missing = False
    for lg in logs:
        if lg.type == PunchType.IN:
            if pending_in is not None:
                has_missing = True  # consecutive INs
            pending_in = lg.timestamp
        else:  # OUT
            if pending_in is None:
                has_missing = True  # OUT without IN
            else:
                worked += int((lg.timestamp - pending_in).total_seconds() // 60)
                pending_in = None
    if pending_in is not None and len(logs) > 0:
        # Open shift — only flag if it's a past day
        if day < utcnow_naive().date():
            has_missing = True

    row.first_in = logs[0].timestamp if logs else None
    row.last_out = logs[-1].timestamp if logs and logs[-1].type == PunchType.OUT else None
    row.worked_minutes = max(0, worked)
    row.has_missing_punch = has_missing

    workday_start = _parse_workday_start()
    row.is_late = bool(row.first_in and row.first_in.time() > workday_start)

    on_leave = _is_on_leave(db, employee_id, day)
    is_hol = _is_holiday(db, day)

    if on_leave:
        row.status = AttendanceStatus.ON_LEAVE
    elif is_hol:
        row.status = AttendanceStatus.HOLIDAY
    elif _is_weekend(day):
        row.status = AttendanceStatus.WEEKEND
    elif row.worked_minutes >= settings.FULL_DAY_MINUTES:
        row.status = AttendanceStatus.PRESENT
    elif row.worked_minutes >= settings.HALF_DAY_MINUTES:
        row.status = AttendanceStatus.HALF_DAY
    elif logs:
        row.status = AttendanceStatus.PRESENT  # short day — present, but worked_minutes reflects actual
    else:
        row.status = AttendanceStatus.ABSENT
    db.flush()
    return row


# ---------------- Reads ----------------
def list_logs(
    db: Session,
    *,
    employee_id: int,
    period_start: date,
    period_end: date,
) -> list[AttendanceLog]:
    return list(
        db.scalars(
            select(AttendanceLog)
            .where(
                AttendanceLog.employee_id == employee_id,
                AttendanceLog.timestamp >= datetime.combine(period_start, time.min),
                AttendanceLog.timestamp <= datetime.combine(period_end, time.max),
            )
            .order_by(AttendanceLog.timestamp.asc())
        )
    )


def month_view(
    db: Session, *, employee_id: int, year: int, month: int
) -> list[AttendanceDaily]:
    start = date(year, month, 1)
    end = (start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    today = utcnow_naive().date()
    upper = min(end, today)

    # Recompute every visible day so the projection is current.
    d = start
    while d <= upper:
        recompute_daily(db, employee_id, d)
        d += timedelta(days=1)

    rows = list(
        db.scalars(
            select(AttendanceDaily)
            .where(
                AttendanceDaily.employee_id == employee_id,
                AttendanceDaily.work_date >= start,
                AttendanceDaily.work_date <= end,
            )
            .order_by(AttendanceDaily.work_date.asc())
        )
    )
    db.commit()
    return rows


def summary(
    db: Session, *, employee_id: int, period_start: date, period_end: date
) -> AttendanceSummary:
    d = period_start
    today = utcnow_naive().date()
    while d <= min(period_end, today):
        recompute_daily(db, employee_id, d)
        d += timedelta(days=1)

    rows = list(
        db.scalars(
            select(AttendanceDaily).where(
                AttendanceDaily.employee_id == employee_id,
                AttendanceDaily.work_date >= period_start,
                AttendanceDaily.work_date <= period_end,
            )
        )
    )
    db.commit()
    counts = defaultdict(int)
    worked = 0
    late = 0
    miss = 0
    for r in rows:
        counts[r.status] += 1
        worked += r.worked_minutes
        if r.is_late:
            late += 1
        if r.has_missing_punch:
            miss += 1
    return AttendanceSummary(
        employee_id=employee_id,
        period_start=period_start,
        period_end=period_end,
        present_days=float(counts[AttendanceStatus.PRESENT]),
        absent_days=float(counts[AttendanceStatus.ABSENT]),
        half_days=float(counts[AttendanceStatus.HALF_DAY]),
        leave_days=float(counts[AttendanceStatus.ON_LEAVE]),
        holiday_count=counts[AttendanceStatus.HOLIDAY],
        weekend_count=counts[AttendanceStatus.WEEKEND],
        late_count=late,
        missing_punch_count=miss,
        total_worked_minutes=worked,
    )


def today_status(db: Session, *, employee_id: int) -> TodayStatus:
    day = utcnow_naive().date()
    row = recompute_daily(db, employee_id, day)
    last = db.scalar(
        select(AttendanceLog)
        .where(AttendanceLog.employee_id == employee_id, func.date(AttendanceLog.timestamp) == day)
        .order_by(AttendanceLog.timestamp.desc())
        .limit(1)
    )
    db.commit()
    return TodayStatus(
        work_date=day,
        is_punched_in=bool(last and last.type == PunchType.IN),
        last_punch_type=last.type if last else None,
        last_punch_at=last.timestamp if last else None,
        first_in=row.first_in,
        last_out=row.last_out,
        worked_minutes=row.worked_minutes,
        status=row.status,
    )
