"""Payroll models: SalaryStructure, PayrollRun, PayrollDetail, Payslip."""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import PayrollStatus
from app.models.types import enum_column


class SalaryStructure(Base):
    """Versioned salary structure for an employee.

    `components` is a list of:
      {code, name, type: EARNING|DEDUCTION, calc: FIXED|PERCENT_OF_BASIC|PERCENT_OF_CTC, value}
    """

    __tablename__ = "salary_structures"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    effective_from: Mapped[date] = mapped_column(Date)
    ctc_annual: Mapped[float] = mapped_column(Numeric(12, 2))
    basic_monthly: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    components: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    employee = relationship("Employee", back_populates="salary_structures")


class PayrollRun(Base):
    __tablename__ = "payroll_runs"
    __table_args__ = (
        UniqueConstraint("period_year", "period_month", name="uq_payroll_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    period_year: Mapped[int] = mapped_column(Integer, index=True)
    period_month: Mapped[int] = mapped_column(Integer, index=True)
    status: Mapped[PayrollStatus] = mapped_column(
        enum_column(PayrollStatus), default=PayrollStatus.DRAFT, index=True
    )

    total_gross: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total_deductions: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total_net: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    employee_count: Mapped[int] = mapped_column(Integer, default=0)

    run_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    locked_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    details: Mapped[List["PayrollDetail"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


class PayrollDetail(Base):
    """Per-employee snapshot for a run. Immutable once the run is LOCKED."""

    __tablename__ = "payroll_details"
    __table_args__ = (
        UniqueConstraint("run_id", "employee_id", name="uq_payroll_detail"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("payroll_runs.id"), index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)

    working_days: Mapped[float] = mapped_column(Numeric(5, 1), default=0)
    present_days: Mapped[float] = mapped_column(Numeric(5, 1), default=0)
    paid_leave_days: Mapped[float] = mapped_column(Numeric(5, 1), default=0)
    lop_days: Mapped[float] = mapped_column(Numeric(5, 1), default=0)
    payable_days: Mapped[float] = mapped_column(Numeric(5, 1), default=0)

    earnings: Mapped[list] = mapped_column(JSON, default=list)
    deductions: Mapped[list] = mapped_column(JSON, default=list)
    gross: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    total_deductions: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    net_pay: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    salary_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)

    run: Mapped["PayrollRun"] = relationship(back_populates="details")
    employee = relationship("Employee")
    payslip: Mapped[Optional["Payslip"]] = relationship(
        back_populates="detail", uselist=False, cascade="all, delete-orphan"
    )

    @property
    def employee_name(self) -> Optional[str]:
        return self.employee.full_name if self.employee else None

    @property
    def employee_code(self) -> Optional[str]:
        return self.employee.employee_code if self.employee else None


class Payslip(Base):
    __tablename__ = "payslips"

    id: Mapped[int] = mapped_column(primary_key=True)
    payroll_detail_id: Mapped[int] = mapped_column(
        ForeignKey("payroll_details.id"), unique=True, index=True
    )
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("payroll_runs.id"), index=True)
    file_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    detail: Mapped["PayrollDetail"] = relationship(back_populates="payslip")
