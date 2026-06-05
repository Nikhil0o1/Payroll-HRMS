"""Attendance regularization requests."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import RegularizationStatus, RegularizationType
from app.models.types import enum_column


class RegularizationRequest(Base):
    __tablename__ = "regularization_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    work_date: Mapped[date] = mapped_column(Date, index=True)
    type: Mapped[RegularizationType] = mapped_column(enum_column(RegularizationType))

    requested_in: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    requested_out: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    reason: Mapped[str] = mapped_column(Text)

    status: Mapped[RegularizationStatus] = mapped_column(
        enum_column(RegularizationStatus), default=RegularizationStatus.PENDING, index=True
    )
    reviewer_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    decision_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    employee = relationship("Employee")

    @property
    def employee_name(self) -> Optional[str]:
        return self.employee.full_name if self.employee else None

    @property
    def employee_code(self) -> Optional[str]:
        return self.employee.employee_code if self.employee else None
