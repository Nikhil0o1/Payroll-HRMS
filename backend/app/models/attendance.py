"""Attendance models.

`AttendanceLog` is the raw, immutable source of truth (punch events).
`AttendanceDaily` is a *derived* per-day projection computed from logs.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import AttendanceStatus, PunchSource, PunchType
from app.models.types import enum_column


class AttendanceLog(Base):
    __tablename__ = "attendance_logs"
    __table_args__ = (Index("ix_att_log_emp_ts", "employee_id", "timestamp"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    type: Mapped[PunchType] = mapped_column(enum_column(PunchType))
    source: Mapped[PunchSource] = mapped_column(
        enum_column(PunchSource), default=PunchSource.WEB
    )
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    note: Mapped[Optional[str]] = mapped_column(nullable=True)

    employee = relationship("Employee")


class AttendanceDaily(Base):
    __tablename__ = "attendance_daily"
    __table_args__ = (
        UniqueConstraint("employee_id", "work_date", name="uq_att_daily_emp_date"),
        Index("ix_att_daily_emp_date", "employee_id", "work_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    work_date: Mapped[date] = mapped_column(Date, index=True)

    first_in: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_out: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    worked_minutes: Mapped[int] = mapped_column(Integer, default=0)

    status: Mapped[AttendanceStatus] = mapped_column(
        enum_column(AttendanceStatus), default=AttendanceStatus.ABSENT
    )
    is_late: Mapped[bool] = mapped_column(Boolean, default=False)
    has_missing_punch: Mapped[bool] = mapped_column(Boolean, default=False)
    # Frozen when the covering month's payroll run is LOCKED.
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)

    employee = relationship("Employee")
