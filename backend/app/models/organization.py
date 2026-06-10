"""Organisation settings: profile + pay schedule, work locations, and the
per-employment-type salary component catalog. These power the Settings area.

`OrganizationProfile` is a singleton row (id == 1)."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import JSON, Boolean, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class OrganizationProfile(Base):
    __tablename__ = "organization_profile"

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(String(200), default="My Organisation")
    legal_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    business_location: Mapped[str] = mapped_column(String(100), default="India")

    address_line1: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    address_line2: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    pincode: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)

    date_format: Mapped[str] = mapped_column(String(20), default="dd/MM/yyyy")
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    # Holds a base64 data URL for the uploaded logo → must be unbounded TEXT.
    logo_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Pay schedule
    work_week: Mapped[list] = mapped_column(JSON, default=lambda: [0, 1, 2, 3, 4])
    salary_calc_basis: Mapped[str] = mapped_column(String(20), default="actual")  # actual | org_days
    org_working_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Loss-of-pay policy:
    #   attendance → pay for days actually present + paid leave (strict)
    #   exception  → pay full salary, deduct only approved unpaid-leave days
    lop_policy: Mapped[str] = mapped_column(String(16), default="attendance")
    pay_day_type: Mapped[str] = mapped_column(String(24), default="last_working_day")  # last_working_day | fixed_day
    pay_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    first_payroll_month: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)


class WorkLocation(Base):
    __tablename__ = "work_locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    address_line1: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    address_line2: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    pincode: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)
    country: Mapped[str] = mapped_column(String(100), default="India")
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)


class SalaryComponentDef(Base):
    """Per-employment-type salary component (earning / deduction). Each
    employment type (FULL_TIME, INTERN, …) has its own set; codes are unique
    within a type. These sets are the templates that build an employee's salary
    structure from their Annual CTC at onboarding."""

    __tablename__ = "salary_component_defs"
    __table_args__ = (
        UniqueConstraint("employment_type", "code", name="uq_salary_component_type_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    employment_type: Mapped[str] = mapped_column(String(20), default="FULL_TIME", index=True)
    code: Mapped[str] = mapped_column(String(40), index=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(16), default="EARNING")  # EARNING | DEDUCTION
    calc_type: Mapped[str] = mapped_column(String(24), default="FIXED")  # FIXED | PERCENT_OF_BASIC | PERCENT_OF_CTC
    calc_value: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    consider_for_epf: Mapped[bool] = mapped_column(Boolean, default=False)
    consider_for_esi: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
