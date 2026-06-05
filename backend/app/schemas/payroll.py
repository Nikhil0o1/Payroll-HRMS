"""Payroll schemas."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field, model_validator

from app.models.enums import CalcType, ComponentType, PayrollStatus
from app.schemas.common import ORMModel

# Sanity caps to keep payroll math well-behaved against bad input.
_MAX_AMOUNT = 100_000_000.0


# ---- Salary structure ----
class SalaryComponent(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=80)
    type: ComponentType
    calc: CalcType
    value: float = Field(ge=0, le=_MAX_AMOUNT)

    @model_validator(mode="after")
    def _percent_in_range(self) -> "SalaryComponent":
        if self.calc in (CalcType.PERCENT_OF_BASIC, CalcType.PERCENT_OF_CTC) and self.value > 100:
            raise ValueError("Percentage components must be between 0 and 100")
        return self


class SalaryStructureCreate(BaseModel):
    employee_id: int
    effective_from: date
    ctc_annual: float = Field(ge=0, le=_MAX_AMOUNT)
    basic_monthly: float = Field(ge=0, le=_MAX_AMOUNT, default=0)
    components: List[SalaryComponent] = []


class SalaryStructureUpdate(BaseModel):
    effective_from: Optional[date] = None
    ctc_annual: Optional[float] = None
    basic_monthly: Optional[float] = None
    components: Optional[List[SalaryComponent]] = None
    is_active: Optional[bool] = None


class SalaryStructureOut(ORMModel):
    id: int
    employee_id: int
    effective_from: date
    ctc_annual: float
    basic_monthly: float
    components: List[SalaryComponent]
    is_active: bool


# ---- Payroll runs ----
class PayrollRunCreate(BaseModel):
    period_year: int = Field(ge=2000, le=2100)
    period_month: int = Field(ge=1, le=12)

    @model_validator(mode="after")
    def _not_future(self) -> "PayrollRunCreate":
        today = date.today()
        if (self.period_year, self.period_month) > (today.year, today.month):
            raise ValueError("Payroll period cannot be in the future")
        return self


class PayrollDetailOut(ORMModel):
    id: int
    run_id: int
    employee_id: int
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None
    working_days: float
    present_days: float
    paid_leave_days: float
    lop_days: float
    payable_days: float
    earnings: List[dict]
    deductions: List[dict]
    gross: float
    total_deductions: float
    net_pay: float
    salary_snapshot: dict


class PayrollRunOut(ORMModel):
    id: int
    period_year: int
    period_month: int
    status: PayrollStatus
    total_gross: float
    total_deductions: float
    total_net: float
    employee_count: int
    run_by_user_id: Optional[int] = None
    approved_by_user_id: Optional[int] = None
    locked_by_user_id: Optional[int] = None
    locked_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class PayrollRunDetailed(PayrollRunOut):
    details: List[PayrollDetailOut] = []


class PayslipOut(ORMModel):
    id: int
    payroll_detail_id: int
    employee_id: int
    run_id: int
    file_key: Optional[str] = None
    generated_at: Optional[datetime] = None
