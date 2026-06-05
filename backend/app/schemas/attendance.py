"""Attendance schemas."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import AttendanceStatus, PunchSource, PunchType
from app.schemas.common import ORMModel


class PunchRequest(BaseModel):
    type: PunchType
    timestamp: Optional[datetime] = None  # default: server now
    note: Optional[str] = None


class AdminPunchCreate(BaseModel):
    employee_id: int
    type: PunchType
    timestamp: datetime
    note: Optional[str] = None


class AttendanceLogOut(ORMModel):
    id: int
    employee_id: int
    timestamp: datetime
    type: PunchType
    source: PunchSource
    note: Optional[str] = None


class AttendanceDailyOut(ORMModel):
    id: int
    employee_id: int
    work_date: date
    first_in: Optional[datetime] = None
    last_out: Optional[datetime] = None
    worked_minutes: int
    status: AttendanceStatus
    is_late: bool
    has_missing_punch: bool
    is_locked: bool


class AttendanceSummary(BaseModel):
    employee_id: int
    period_start: date
    period_end: date
    present_days: float
    absent_days: float
    half_days: float
    leave_days: float
    holiday_count: int
    weekend_count: int
    late_count: int
    missing_punch_count: int
    total_worked_minutes: int


class TodayStatus(BaseModel):
    work_date: date
    is_punched_in: bool
    last_punch_type: Optional[PunchType] = None
    last_punch_at: Optional[datetime] = None
    first_in: Optional[datetime] = None
    last_out: Optional[datetime] = None
    worked_minutes: int = 0
    status: AttendanceStatus = AttendanceStatus.ABSENT
