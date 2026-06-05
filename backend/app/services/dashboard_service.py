"""Dashboard metric aggregations."""
from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.attendance import AttendanceDaily
from app.models.employee import Employee
from app.models.enums import (
    AttendanceStatus,
    EmployeeStatus,
    LeaveStatus,
    PayrollStatus,
    RegularizationStatus,
)
from app.models.holiday import Holiday
from app.models.leave import LeaveRequest
from app.models.payroll import PayrollDetail, PayrollRun, Payslip
from app.models.regularization import RegularizationRequest
from app.models.user import User
from app.schemas.dashboard import (
    AdminDashboardMetrics,
    EmployeeDashboard,
    PayrollCostPoint,
    PayrollMonthPoint,
    RunSummary,
    UpcomingHoliday,
)
from app.services import attendance_service, leave_service


def admin_metrics(db: Session) -> AdminDashboardMetrics:
    today = utcnow_naive().date()

    total_employees = db.scalar(select(func.count(Employee.id))) or 0
    active_employees = db.scalar(
        select(func.count(Employee.id)).where(Employee.status == EmployeeStatus.ACTIVE)
    ) or 0

    # Recompute today's projection on a sample? Keep cheap — query existing rows.
    present = db.scalar(
        select(func.count(AttendanceDaily.id)).where(
            AttendanceDaily.work_date == today,
            AttendanceDaily.status.in_(
                [AttendanceStatus.PRESENT, AttendanceStatus.HALF_DAY]
            ),
        )
    ) or 0
    on_leave = db.scalar(
        select(func.count(LeaveRequest.id)).where(
            LeaveRequest.status == LeaveStatus.APPROVED,
            LeaveRequest.start_date <= today,
            LeaveRequest.end_date >= today,
        )
    ) or 0
    absent = max(0, active_employees - present - on_leave)

    pending_leaves = db.scalar(
        select(func.count(LeaveRequest.id)).where(LeaveRequest.status == LeaveStatus.PENDING)
    ) or 0
    pending_regs = db.scalar(
        select(func.count(RegularizationRequest.id)).where(
            RegularizationRequest.status == RegularizationStatus.PENDING
        )
    ) or 0

    last_locked = db.scalar(
        select(PayrollRun)
        .where(PayrollRun.status == PayrollStatus.LOCKED)
        .order_by(desc(PayrollRun.period_year), desc(PayrollRun.period_month))
        .limit(1)
    )
    last_locked_label = (
        f"{last_locked.period_year}-{last_locked.period_month:02d}" if last_locked else None
    )

    # Upcoming payroll = next month after last locked, else current month
    if last_locked:
        y, m = last_locked.period_year, last_locked.period_month + 1
        if m > 12:
            y, m = y + 1, 1
    else:
        y, m = today.year, today.month
    upcoming = f"{y}-{m:02d}"

    # Run for the upcoming period (may not exist yet → "yet to process").
    cur = db.scalar(
        select(PayrollRun).where(
            PayrollRun.period_year == y, PayrollRun.period_month == m
        )
    )
    current_run = RunSummary(
        id=cur.id if cur else None,
        period_year=y,
        period_month=m,
        status=cur.status.value if cur else None,
        total_gross=float(cur.total_gross) if cur else 0.0,
        total_deductions=float(cur.total_deductions) if cur else 0.0,
        total_net=float(cur.total_net) if cur else 0.0,
        employee_count=cur.employee_count if cur else active_employees,
    )

    # Monthly payroll-cost series. Always returns the trailing 12 months
    # ending at the current month; months without a payroll run get zeroed
    # entries so the chart displays a continuous yearly axis (Zoho-style).
    all_runs = list(
        db.scalars(
            select(PayrollRun).order_by(
                PayrollRun.period_year.asc(), PayrollRun.period_month.asc()
            )
        )
    )
    runs_by_period = {(r.period_year, r.period_month): r for r in all_runs}
    months: list[tuple[int, int]] = []
    cy, cm = today.year, today.month
    for _ in range(12):
        months.append((cy, cm))
        cm -= 1
        if cm == 0:
            cm = 12
            cy -= 1
    months.reverse()
    series = [
        PayrollMonthPoint(
            label=f"{calendar.month_abbr[m]} {y}",
            period_year=y,
            period_month=m,
            net=float(runs_by_period[(y, m)].total_net) if (y, m) in runs_by_period else 0.0,
            deductions=float(runs_by_period[(y, m)].total_deductions)
            if (y, m) in runs_by_period
            else 0.0,
            gross=float(runs_by_period[(y, m)].total_gross) if (y, m) in runs_by_period else 0.0,
        )
        for (y, m) in months
    ]
    ytd = [r for r in all_runs if r.period_year == today.year]
    ytd_gross = round(sum(float(r.total_gross) for r in ytd), 2)
    ytd_deductions = round(sum(float(r.total_deductions) for r in ytd), 2)
    ytd_net = round(sum(float(r.total_net) for r in ytd), 2)

    return AdminDashboardMetrics(
        total_employees=total_employees,
        active_employees=active_employees,
        present_today=present,
        absent_today=absent,
        on_leave_today=on_leave,
        pending_leave_approvals=pending_leaves,
        pending_regularizations=pending_regs,
        upcoming_payroll_period=upcoming,
        last_locked_run=last_locked_label,
        currency=settings.DEFAULT_CURRENCY,
        current_run=current_run,
        payroll_cost_series=series,
        ytd_gross=ytd_gross,
        ytd_deductions=ytd_deductions,
        ytd_net=ytd_net,
    )


def payroll_cost_breakdown(db: Session) -> list[PayrollCostPoint]:
    """Trailing 12 months. Each month with a payroll run is split into
    Net Pay + each deduction component (PF, PT, TDS, …) so the chart renders
    real multi-shade stacked bars — no synthetic data."""
    today = utcnow_naive().date()
    runs = list(
        db.scalars(
            select(PayrollRun).order_by(
                PayrollRun.period_year.asc(), PayrollRun.period_month.asc()
            )
        )
    )
    by_period = {(r.period_year, r.period_month): r for r in runs}

    months: list[tuple[int, int]] = []
    cy, cm = today.year, today.month
    for _ in range(12):
        months.append((cy, cm))
        cm -= 1
        if cm == 0:
            cm, cy = 12, cy - 1
    months.reverse()

    points: list[PayrollCostPoint] = []
    for (y, m) in months:
        segments: dict[str, float] = {}
        total = 0.0
        run = by_period.get((y, m))
        if run is not None:
            details = list(
                db.scalars(select(PayrollDetail).where(PayrollDetail.run_id == run.id))
            )
            net = round(sum(float(d.net_pay) for d in details), 2)
            ded_totals: dict[str, float] = {}
            for d in details:
                for item in d.deductions or []:
                    name = item.get("name") or item.get("code") or "Deduction"
                    ded_totals[name] = round(
                        ded_totals.get(name, 0.0) + float(item.get("amount") or 0), 2
                    )
            segments = {"Net Pay": net}
            for name, amt in ded_totals.items():
                if amt:
                    segments[name] = amt
            total = round(net + sum(ded_totals.values()), 2)
        points.append(
            PayrollCostPoint(
                label=f"{calendar.month_abbr[m]} {y}",
                period_year=y,
                period_month=m,
                segments=segments,
                total=total,
            )
        )
    return points


def employee_dashboard(db: Session, *, employee_id: int) -> EmployeeDashboard:
    today = utcnow_naive().date()
    today_status = attendance_service.today_status(db, employee_id=employee_id)

    balances = leave_service.get_balances(db, employee_id, today.year)
    bal_payload = [
        {
            "leave_type_id": b.leave_type_id,
            "leave_type": {"id": b.leave_type.id, "code": b.leave_type.code, "name": b.leave_type.name, "color": b.leave_type.color}
            if b.leave_type
            else None,
            "allotted": float(b.allotted),
            "used": float(b.used),
            "pending": float(b.pending),
            "available": float(b.available),
        }
        for b in balances
    ]

    upcoming_rows = list(
        db.scalars(
            select(Holiday)
            .where(Holiday.date >= today)
            .order_by(Holiday.date.asc())
            .limit(5)
        )
    )
    holidays = [
        UpcomingHoliday(id=h.id, name=h.name, date=h.date, days_away=(h.date - today).days)
        for h in upcoming_rows
    ]

    pending_leaves = db.scalar(
        select(func.count(LeaveRequest.id)).where(
            LeaveRequest.employee_id == employee_id,
            LeaveRequest.status == LeaveStatus.PENDING,
        )
    ) or 0
    pending_regs = db.scalar(
        select(func.count(RegularizationRequest.id)).where(
            RegularizationRequest.employee_id == employee_id,
            RegularizationRequest.status == RegularizationStatus.PENDING,
        )
    ) or 0

    recent_runs = [
        ps.run_id
        for ps in db.scalars(
            select(Payslip)
            .where(Payslip.employee_id == employee_id)
            .order_by(Payslip.id.desc())
            .limit(3)
        )
    ]

    return EmployeeDashboard(
        today_status=today_status.model_dump(mode="json"),
        leave_balances=bal_payload,
        upcoming_holidays=holidays,
        pending_leaves=pending_leaves,
        pending_regularizations=pending_regs,
        recent_payslip_run_ids=recent_runs,
    )
