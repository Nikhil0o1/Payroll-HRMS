"""Leave models: LeaveType, LeaveBalance, LeaveRequest."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import LeaveStatus
from app.models.types import enum_column


class LeaveType(Base):
    __tablename__ = "leave_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # CASUAL/SICK/EARNED
    name: Mapped[str] = mapped_column(String(80))
    default_annual_quota: Mapped[float] = mapped_column(Numeric(5, 1), default=0)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True)
    color: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)


class LeaveBalance(Base):
    __tablename__ = "leave_balances"
    __table_args__ = (
        UniqueConstraint("employee_id", "leave_type_id", "year", name="uq_leave_balance"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    leave_type_id: Mapped[int] = mapped_column(ForeignKey("leave_types.id"))
    year: Mapped[int] = mapped_column(Integer, index=True)

    allotted: Mapped[float] = mapped_column(Numeric(5, 1), default=0)
    used: Mapped[float] = mapped_column(Numeric(5, 1), default=0)
    pending: Mapped[float] = mapped_column(Numeric(5, 1), default=0)

    leave_type = relationship("LeaveType")

    @property
    def available(self) -> float:
        return float(self.allotted) - float(self.used) - float(self.pending)


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    leave_type_id: Mapped[int] = mapped_column(ForeignKey("leave_types.id"))

    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    days: Mapped[float] = mapped_column(Numeric(4, 1))
    half_day: Mapped[bool] = mapped_column(Boolean, default=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[LeaveStatus] = mapped_column(
        enum_column(LeaveStatus), default=LeaveStatus.PENDING, index=True
    )
    approver_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    decision_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    employee = relationship("Employee")
    leave_type = relationship("LeaveType")

    @property
    def employee_name(self) -> Optional[str]:
        return self.employee.full_name if self.employee else None

    @property
    def employee_code(self) -> Optional[str]:
        return self.employee.employee_code if self.employee else None
