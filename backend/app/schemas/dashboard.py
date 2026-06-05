"""Dashboard / metrics schemas."""
from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import BaseModel


class PayrollMonthPoint(BaseModel):
    label: str
    period_year: int
    period_month: int
    net: float
    deductions: float
    gross: float


class PayrollCostPoint(BaseModel):
    """A month's payroll cost split into stacked segments (Net Pay + each
    deduction component), for the multi-shade cost chart."""

    label: str
    period_year: int
    period_month: int
    segments: dict[str, float] = {}
    total: float = 0


class RunSummary(BaseModel):
    id: Optional[int] = None
    period_year: int
    period_month: int
    status: Optional[str] = None
    total_gross: float = 0
    total_deductions: float = 0
    total_net: float = 0
    employee_count: int = 0


class AdminDashboardMetrics(BaseModel):
    total_employees: int
    active_employees: int
    present_today: int
    absent_today: int
    on_leave_today: int
    pending_leave_approvals: int
    pending_regularizations: int
    upcoming_payroll_period: Optional[str] = None
    last_locked_run: Optional[str] = None
    currency: str = "INR"
    current_run: Optional[RunSummary] = None
    payroll_cost_series: List[PayrollMonthPoint] = []
    ytd_gross: float = 0
    ytd_deductions: float = 0
    ytd_net: float = 0


class UpcomingHoliday(BaseModel):
    id: int
    name: str
    date: date
    days_away: int


class EmployeeDashboard(BaseModel):
    today_status: dict
    leave_balances: List[dict]
    upcoming_holidays: List[UpcomingHoliday]
    pending_leaves: int
    pending_regularizations: int
    recent_payslip_run_ids: List[int]
