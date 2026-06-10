"""Payroll engine: salary structures, runs, locking, payslip PDFs."""
from __future__ import annotations

import logging
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Tuple

from sqlalchemy import desc, func, select, update
from sqlalchemy.orm import Session, selectinload

from app.core.audit import record_audit
from app.core.config import settings
from app.core.exceptions import ConflictError, DomainError, NotFoundError
from app.core.time import utcnow_naive
from app.core.pagination import PageParams, paginate
from app.core.storage import get_storage
from app.models.attendance import AttendanceDaily
from app.models.employee import Employee
from app.models.enums import (
    AttendanceStatus,
    CalcType,
    ComponentType,
    EmployeeStatus,
    LeaveStatus,
    PayrollStatus,
)
from app.models.holiday import Holiday
from app.models.leave import LeaveRequest, LeaveType
from app.models.organization import OrganizationProfile, SalaryComponentDef
from app.models.payroll import PayrollDetail, PayrollRun, Payslip, SalaryStructure
from app.models.user import User
from app.schemas.payroll import (
    PayrollRunCreate,
    SalaryStructureCreate,
    SalaryStructureUpdate,
)
from app.services import attendance_service, shift_service

logger = logging.getLogger("hrms")


# ---------- Salary Structure ----------
def get_active_structure(db: Session, employee_id: int, on_date: date) -> Optional[SalaryStructure]:
    return db.scalar(
        select(SalaryStructure)
        .where(
            SalaryStructure.employee_id == employee_id,
            SalaryStructure.effective_from <= on_date,
            SalaryStructure.is_active.is_(True),
        )
        .order_by(desc(SalaryStructure.effective_from))
        .limit(1)
    )


def list_structures(db: Session, employee_id: int) -> list[SalaryStructure]:
    return list(
        db.scalars(
            select(SalaryStructure)
            .where(SalaryStructure.employee_id == employee_id)
            .order_by(desc(SalaryStructure.effective_from))
        )
    )


def create_structure(db: Session, payload: SalaryStructureCreate, actor: User) -> SalaryStructure:
    emp = db.get(Employee, payload.employee_id)
    if not emp:
        raise NotFoundError("Employee not found")

    # Deactivate any existing active structure for same employee
    for s in db.scalars(
        select(SalaryStructure).where(
            SalaryStructure.employee_id == payload.employee_id,
            SalaryStructure.is_active.is_(True),
        )
    ):
        s.is_active = False

    components = [c.model_dump() for c in payload.components]
    s = SalaryStructure(
        employee_id=payload.employee_id,
        effective_from=payload.effective_from,
        ctc_annual=payload.ctc_annual,
        basic_monthly=payload.basic_monthly,
        components=components,
        is_active=True,
    )
    db.add(s)
    db.flush()
    record_audit(
        db,
        actor=actor,
        action="salary.create",
        entity="salary_structures",
        entity_id=s.id,
        after={"employee_id": s.employee_id, "ctc_annual": float(s.ctc_annual), "components": components},
    )
    db.commit()
    db.refresh(s)
    return s


# Salary component categories (defined in `salary_component_defs`) don't map
# 1:1 to the EARNING/DEDUCTION enum used by the payroll engine. This mapping
# is the single point of truth for translating a *catalog* component into a
# *structure* component. Reimbursements are paid out to the employee, so they
# count as earnings on the payslip.
_CATEGORY_TO_TYPE: dict[str, ComponentType] = {
    "EARNING": ComponentType.EARNING,
    "REIMBURSEMENT": ComponentType.EARNING,
    "DEDUCTION": ComponentType.DEDUCTION,
}


def update_structure(db: Session, structure_id: int, payload: SalaryStructureUpdate, actor: User) -> SalaryStructure:
    s = db.get(SalaryStructure, structure_id)
    if not s:
        raise NotFoundError("Salary structure not found")
    data = payload.model_dump(exclude_unset=True)
    if "components" in data and data["components"] is not None:
        data["components"] = [c.model_dump() if hasattr(c, "model_dump") else c for c in data["components"]]
    before = {
        "ctc_annual": float(s.ctc_annual),
        "basic_monthly": float(s.basic_monthly),
        "is_active": s.is_active,
    }
    for k, v in data.items():
        setattr(s, k, v)
    record_audit(
        db,
        actor=actor,
        action="salary.update",
        entity="salary_structures",
        entity_id=s.id,
        before=before,
        after=data,
    )
    db.commit()
    db.refresh(s)
    return s


# ---------- Salary structure from an employment-type component set ----------
def _round(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _looks_like_basic(code: str, name: str) -> bool:
    """Identify the 'base pay' component without depending on a single magic
    code. The Salary Components page lets admins pick any code (BASIC, BAS,
    BASE_PAY, …), so we match on the code prefix or the human name. This is the
    anchor for PERCENT_OF_BASIC components and the headline earning."""
    c = (code or "").strip().upper()
    n = (name or "").strip().lower()
    return c.startswith("BAS") or "basic" in n or "base pay" in n or "base salary" in n


def _components_for_employment_type(
    db: Session, employment_type: str, ctc_annual: float
) -> Tuple[float, list]:
    """Map an employment type's component catalog into structure components and
    derive monthly Basic. Returns (basic_monthly, structure_components)."""
    comps = list(
        db.scalars(
            select(SalaryComponentDef)
            .where(
                SalaryComponentDef.employment_type == employment_type.upper(),
                SalaryComponentDef.is_active.is_(True),
            )
            .order_by(SalaryComponentDef.category.desc(), SalaryComponentDef.name)
        )
    )
    monthly_ctc = float(ctc_annual) / 12.0
    structure_components: list[dict] = []
    basic_monthly = 0.0
    for c in comps:
        structure_components.append(
            {
                "code": c.code,
                "name": c.name,
                "type": c.category,       # EARNING | DEDUCTION
                "calc": c.calc_type,      # FIXED | PERCENT_OF_BASIC | PERCENT_OF_CTC
                "value": float(c.calc_value),
            }
        )
        if basic_monthly <= 0 and _looks_like_basic(c.code, c.name):
            if c.calc_type == "FIXED":
                basic_monthly = float(c.calc_value)
            elif c.calc_type == "PERCENT_OF_CTC":
                basic_monthly = monthly_ctc * float(c.calc_value) / 100.0
            elif c.calc_type == "PERCENT_OF_BASIC":
                basic_monthly = monthly_ctc * float(c.calc_value) / 100.0
    if basic_monthly <= 0:
        basic_monthly = monthly_ctc * 0.5  # sensible fallback when no Basic configured
    return _round(basic_monthly), structure_components


def preview_salary(db: Session, employment_type: str, ctc_annual: float) -> dict:
    """Compute the monthly salary breakdown an employee of *employment_type*
    would get for *ctc_annual*, using that type's components. Pure preview — no
    DB writes. Powers the onboarding wizard's salary step."""
    from types import SimpleNamespace

    basic_monthly, components = _components_for_employment_type(db, employment_type, ctc_annual)
    structure = SimpleNamespace(ctc_annual=ctc_annual, basic_monthly=basic_monthly, components=components)
    earnings, deductions = _resolve_components(structure)
    gross = _round(sum(e["amount"] for e in earnings))
    total_ded = _round(sum(d["amount"] for d in deductions))
    return {
        "employment_type": employment_type.upper(),
        "ctc_annual": float(ctc_annual),
        "monthly_ctc": _round(float(ctc_annual) / 12.0),
        "basic_monthly": basic_monthly,
        "earnings": earnings,
        "deductions": deductions,
        "gross": gross,
        "total_deductions": total_ded,
        "net": _round(gross - total_ded),
        "component_count": len(components),
    }


def create_structure_for_type(
    db: Session,
    *,
    employee_id: int,
    employment_type: str,
    ctc_annual: float,
    effective_from: date,
    actor: User,
) -> "SalaryStructure":
    """Build + persist a versioned salary structure for an employee from their
    employment type's component set (used at onboarding)."""
    basic_monthly, components = _components_for_employment_type(db, employment_type, ctc_annual)
    payload = SalaryStructureCreate(
        employee_id=employee_id,
        effective_from=effective_from,
        ctc_annual=ctc_annual,
        basic_monthly=basic_monthly,
        components=components,
    )
    return create_structure(db, payload, actor)


# ---------- Payroll calculation ----------


def _employee_weekly_offs(db: Session, employee_id: int) -> set[int]:
    """Weekly-off weekday set from the employee's shift (global default if none)."""
    shift = shift_service.resolve_employee_shift(db, employee_id)
    if shift is not None:
        return set(shift.weekly_offs or [])
    return set(settings.WEEKEND_DAYS)


def _working_days(
    db: Session,
    year: int,
    month: int,
    weekly_offs: set[int],
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> int:
    """Working days in the month (calendar days minus weekly offs and public
    holidays). An optional [start, end] sub-range restricts the count to the
    days an employee was actually employed (joiner/leaver proration). Weekly
    offs and holidays are always excluded — only true working days can be LOP."""
    period_first = date(year, month, 1)
    period_last = date(year, month, monthrange(year, month)[1])
    start = max(start, period_first) if start else period_first
    end = min(end, period_last) if end else period_last
    if start > end:
        return 0
    holidays = {
        h.date
        for h in db.scalars(
            select(Holiday).where(
                Holiday.year == year, func.extract("month", Holiday.date) == month
            )
        )
    }
    count = 0
    d = start
    while d <= end:
        if d.weekday() not in weekly_offs and d not in holidays:
            count += 1
        d += timedelta(days=1)
    return count


def _attendance_present_leave(
    db: Session, employee_id: int, start: date, end: date
) -> Tuple[float, float]:
    """Return (present_days, paid_leave_days) within [start, end], derived from
    attendance *status* (after shift rules in recompute_daily): PRESENT=1,
    HALF_DAY=0.5, ON_LEAVE counts as paid leave."""
    if start > end:
        return 0.0, 0.0

    # Make sure the daily projection is up to date (only up to today).
    d = start
    today = utcnow_naive().date()
    upper = min(end, today)
    while d <= upper:
        attendance_service.recompute_daily(db, employee_id, d)
        d += timedelta(days=1)

    rows = list(
        db.scalars(
            select(AttendanceDaily).where(
                AttendanceDaily.employee_id == employee_id,
                AttendanceDaily.work_date >= start,
                AttendanceDaily.work_date <= end,
            )
        )
    )
    present_days = 0.0
    paid_leave = 0.0
    for r in rows:
        if r.status == AttendanceStatus.PRESENT:
            present_days += 1
        elif r.status == AttendanceStatus.HALF_DAY:
            present_days += 0.5
        elif r.status == AttendanceStatus.ON_LEAVE:
            paid_leave += 1
    return present_days, paid_leave


def _org_lop_policy(db: Session) -> str:
    """Org LOP policy: 'attendance' (pay for present + leave) or 'exception'
    (pay full salary, deduct only approved unpaid leave). Defaults to attendance."""
    p = db.scalar(select(OrganizationProfile).order_by(OrganizationProfile.id).limit(1))
    return (getattr(p, "lop_policy", None) or "attendance") if p else "attendance"


def _unpaid_leave_working_days(
    db: Session, employee_id: int, start: date, end: date, weekly_offs: set[int]
) -> float:
    """Working days (excluding weekly offs & holidays) the employee was on an
    *approved, unpaid* leave within [start, end]. Used by the 'exception' LOP
    policy — these are the only days that reduce pay."""
    if start > end:
        return 0.0
    holidays = {
        h.date
        for h in db.scalars(
            select(Holiday).where(
                Holiday.year == start.year, func.extract("month", Holiday.date) == start.month
            )
        )
    }
    reqs = list(
        db.scalars(
            select(LeaveRequest)
            .join(LeaveType, LeaveType.id == LeaveRequest.leave_type_id)
            .where(
                LeaveRequest.employee_id == employee_id,
                LeaveRequest.status == LeaveStatus.APPROVED,
                LeaveType.is_paid.is_(False),
                LeaveRequest.start_date <= end,
                LeaveRequest.end_date >= start,
            )
        )
    )
    total = 0.0
    for r in reqs:
        s = max(r.start_date, start)
        e = min(r.end_date, end)
        wd = 0
        d = s
        while d <= e:
            if d.weekday() not in weekly_offs and d not in holidays:
                wd += 1
            d += timedelta(days=1)
        if r.half_day:
            total += 0.5 if wd >= 1 else 0.0
        else:
            total += float(wd)
    return total


def _resolve_components(structure: SalaryStructure) -> Tuple[list, list]:
    """Resolve components to monthly amounts (full pay).

    Returns (earnings, deductions) lists of {code,name,amount} dicts.
    """
    monthly_ctc = float(structure.ctc_annual) / 12.0
    basic = float(structure.basic_monthly or 0)
    if basic == 0:
        # Fall back to 50% of monthly CTC if basic isn't explicitly set.
        basic = monthly_ctc * 0.5

    earnings: list[dict] = []
    deductions: list[dict] = []

    for raw in structure.components or []:
        code = raw.get("code")
        name = raw.get("name", code)
        ctype = ComponentType(raw.get("type"))
        calc = CalcType(raw.get("calc"))
        value = float(raw.get("value") or 0)
        if calc == CalcType.FIXED:
            amount = value
        elif calc == CalcType.PERCENT_OF_BASIC:
            amount = basic * value / 100.0
        else:  # PERCENT_OF_CTC
            amount = monthly_ctc * value / 100.0
        item = {"code": code, "name": name, "amount": _round(amount)}
        if ctype == ComponentType.EARNING:
            earnings.append(item)
        else:
            deductions.append(item)

    # Legacy safety net only: a structure that has a basic_monthly but no earning
    # lines at all (older or hand-built records) still shows Basic. We must NOT
    # inject when earnings already exist — the components list is the source of
    # truth, and fabricating a second "Basic" double-counts base pay (the bug
    # that made a ₹20k intern show ₹30k gross when their component was coded
    # "BAS" instead of "BASIC").
    if not earnings and basic > 0:
        earnings.insert(0, {"code": "BASIC", "name": "Basic", "amount": _round(basic)})

    return earnings, deductions


def _prorate(items: list[dict], factor: float) -> list[dict]:
    return [{**it, "amount": _round(it["amount"] * factor)} for it in items]


def compute_employee(
    db: Session, run: PayrollRun, employee: Employee
) -> Optional[PayrollDetail]:
    """Build/refresh a per-employee detail snapshot for a non-locked run."""
    if run.status == PayrollStatus.LOCKED:
        raise ConflictError("Cannot recompute a locked run")

    period_first = date(run.period_year, run.period_month, 1)
    structure = get_active_structure(db, employee.id, period_first)
    if not structure:
        return None  # employee has no salary structure → skip

    # Employment window within the period (prorates joiners/leavers): only the
    # days the employee was actually on the rolls count. Someone who joins after
    # the month or left before it isn't part of this run at all.
    period_last = date(run.period_year, run.period_month, monthrange(run.period_year, run.period_month)[1])
    window_start = max(period_first, employee.date_of_joining)
    window_end = period_last
    if employee.date_of_exit:
        window_end = min(window_end, employee.date_of_exit)
    if window_start > window_end:
        return None  # not employed during this period

    weekly_offs = _employee_weekly_offs(db, employee.id)
    # Denominator = full month's working days; numerator = days actually paid.
    working = float(_working_days(db, run.period_year, run.period_month, weekly_offs))
    employed_working = float(
        _working_days(db, run.period_year, run.period_month, weekly_offs, window_start, window_end)
    )
    present, paid_leave = _attendance_present_leave(db, employee.id, window_start, window_end)

    policy = _org_lop_policy(db)
    if policy == "exception":
        # Pay full salary; deduct only approved unpaid-leave days. Present/absent
        # attendance does NOT reduce pay under this policy.
        lop = min(_unpaid_leave_working_days(db, employee.id, window_start, window_end, weekly_offs), employed_working)
        payable = max(0.0, employed_working - lop)
    else:
        # Attendance-based: pay for days present + (paid) leave. LOP = employed
        # working days that were neither. Days outside the employment window are
        # never LOP (joiner/leaver proration).
        payable = min(present + paid_leave, employed_working)
        lop = max(0.0, employed_working - payable)
    factor = (payable / working) if working > 0 else 0.0

    earnings_full, deductions_full = _resolve_components(structure)
    earnings = _prorate(earnings_full, factor)
    deductions = _prorate(deductions_full, factor)
    gross = _round(sum(e["amount"] for e in earnings))
    total_ded = _round(sum(d["amount"] for d in deductions))
    net = _round(gross - total_ded)

    detail = db.scalar(
        select(PayrollDetail).where(
            PayrollDetail.run_id == run.id, PayrollDetail.employee_id == employee.id
        )
    )
    if detail is None:
        detail = PayrollDetail(run_id=run.id, employee_id=employee.id)
        db.add(detail)

    detail.working_days = working
    detail.present_days = present
    detail.paid_leave_days = paid_leave
    detail.lop_days = lop
    detail.payable_days = payable
    detail.earnings = earnings
    detail.deductions = deductions
    detail.gross = gross
    detail.total_deductions = total_ded
    detail.net_pay = net
    detail.salary_snapshot = {
        "structure_id": structure.id,
        "ctc_annual": float(structure.ctc_annual),
        "basic_monthly": float(structure.basic_monthly or 0),
        "components": list(structure.components or []),
        "earnings_full": earnings_full,
        "deductions_full": deductions_full,
        "lop_policy": policy,
        "employed_working_days": employed_working,
        "factor": _round(factor),
    }
    db.flush()
    return detail


def _refresh_run_totals(run: PayrollRun) -> None:
    run.total_gross = _round(sum(float(d.gross) for d in run.details))
    run.total_deductions = _round(sum(float(d.total_deductions) for d in run.details))
    run.total_net = _round(sum(float(d.net_pay) for d in run.details))
    run.employee_count = len(run.details)


# ---------- Run lifecycle ----------
def list_runs(db: Session, params: PageParams) -> Tuple[list[PayrollRun], int]:
    stmt = select(PayrollRun).order_by(PayrollRun.period_year.desc(), PayrollRun.period_month.desc())
    return paginate(db, stmt, params)


def get_run(db: Session, run_id: int) -> PayrollRun:
    run = db.execute(
        select(PayrollRun)
        .options(selectinload(PayrollRun.details).selectinload(PayrollDetail.employee))
        .where(PayrollRun.id == run_id)
    ).scalar_one_or_none()
    if not run:
        raise NotFoundError("Payroll run not found")
    return run


def create_run(db: Session, payload: PayrollRunCreate, actor: User) -> PayrollRun:
    existing = db.scalar(
        select(PayrollRun).where(
            PayrollRun.period_year == payload.period_year,
            PayrollRun.period_month == payload.period_month,
        )
    )
    if existing:
        raise ConflictError(
            f"A payroll run for {payload.period_year}-{payload.period_month:02d} already exists "
            f"(status={existing.status.value})"
        )
    run = PayrollRun(
        period_year=payload.period_year,
        period_month=payload.period_month,
        status=PayrollStatus.DRAFT,
        run_by_user_id=actor.id,
    )
    db.add(run)
    db.flush()

    employees = list(
        db.scalars(select(Employee).where(Employee.status == EmployeeStatus.ACTIVE))
    )
    for emp in employees:
        compute_employee(db, run, emp)
    _refresh_run_totals(run)

    record_audit(
        db,
        actor=actor,
        action="payroll.run_create",
        entity="payroll_runs",
        entity_id=run.id,
        after={
            "period": f"{run.period_year}-{run.period_month:02d}",
            "employee_count": run.employee_count,
            "total_net": float(run.total_net),
        },
    )
    db.commit()
    db.refresh(run)
    return run


def recompute_run(db: Session, run_id: int, actor: User) -> PayrollRun:
    run = get_run(db, run_id)
    if run.status == PayrollStatus.LOCKED:
        raise ConflictError("Cannot recompute a locked run")
    before = {
        "total_gross": float(run.total_gross),
        "total_deductions": float(run.total_deductions),
        "total_net": float(run.total_net),
        "employee_count": run.employee_count,
    }
    employees = list(
        db.scalars(select(Employee).where(Employee.status == EmployeeStatus.ACTIVE))
    )
    for emp in employees:
        compute_employee(db, run, emp)
    _refresh_run_totals(run)
    after = {
        "total_gross": float(run.total_gross),
        "total_deductions": float(run.total_deductions),
        "total_net": float(run.total_net),
        "employee_count": run.employee_count,
    }
    record_audit(
        db,
        actor=actor,
        action="payroll.run_recompute",
        entity="payroll_runs",
        entity_id=run.id,
        before=before,
        after=after,
    )
    db.commit()
    db.refresh(run)
    return run


def _transition(run: PayrollRun, target: PayrollStatus) -> None:
    valid = {
        PayrollStatus.DRAFT: {PayrollStatus.REVIEW},
        PayrollStatus.REVIEW: {PayrollStatus.DRAFT, PayrollStatus.APPROVED},
        PayrollStatus.APPROVED: {PayrollStatus.REVIEW, PayrollStatus.LOCKED},
        PayrollStatus.LOCKED: set(),
    }
    if target not in valid[run.status]:
        raise ConflictError(f"Cannot move payroll from {run.status.value} → {target.value}")
    run.status = target


def submit_for_review(db: Session, run_id: int, actor: User) -> PayrollRun:
    run = get_run(db, run_id)
    _transition(run, PayrollStatus.REVIEW)
    record_audit(db, actor=actor, action="payroll.submit_review", entity="payroll_runs", entity_id=run.id)
    db.commit()
    db.refresh(run)
    return run


def approve_run(db: Session, run_id: int, actor: User) -> PayrollRun:
    run = get_run(db, run_id)
    # Segregation of duties (maker-checker): the person who created the run may
    # not approve it. Approval must come from a different privileged user.
    if (
        settings.PAYROLL_REQUIRE_SEPARATE_APPROVER
        and run.run_by_user_id is not None
        and run.run_by_user_id == actor.id
    ):
        raise ConflictError(
            "Segregation of duties: a payroll run must be approved by a different "
            "user than the one who created it."
        )
    _transition(run, PayrollStatus.APPROVED)
    run.approved_by_user_id = actor.id
    record_audit(db, actor=actor, action="payroll.approve", entity="payroll_runs", entity_id=run.id)
    db.commit()
    db.refresh(run)
    return run


def reopen_run(db: Session, run_id: int, actor: User) -> PayrollRun:
    run = get_run(db, run_id)
    if run.status not in (PayrollStatus.REVIEW, PayrollStatus.APPROVED):
        raise ConflictError(f"Cannot reopen a {run.status.value} run")
    run.status = PayrollStatus.DRAFT
    run.approved_by_user_id = None
    record_audit(db, actor=actor, action="payroll.reopen", entity="payroll_runs", entity_id=run.id)
    db.commit()
    db.refresh(run)
    return run


def lock_run(db: Session, run_id: int, actor: User) -> PayrollRun:
    run = get_run(db, run_id)
    if run.status != PayrollStatus.APPROVED:
        raise ConflictError("Only APPROVED runs can be locked")

    last = monthrange(run.period_year, run.period_month)[1]
    start = date(run.period_year, run.period_month, 1)
    end = date(run.period_year, run.period_month, last)

    # Freeze daily projections for the period in a single atomic UPDATE so the
    # lock can never half-apply (some rows frozen, run not marked LOCKED).
    #
    # Important: only freeze days that have *actually happened* (≤ today). For
    # a mid-month lock (rare but supported, e.g. early payroll closure for a
    # partial month), future days must remain editable so employees can keep
    # punching for the rest of the month — otherwise the next month's payroll
    # would inherit a frozen, stale projection.
    freeze_through = min(end, utcnow_naive().date())
    db.execute(
        update(AttendanceDaily)
        .where(AttendanceDaily.work_date >= start, AttendanceDaily.work_date <= freeze_through)
        .values(is_locked=True)
    )

    run.status = PayrollStatus.LOCKED
    run.locked_by_user_id = actor.id
    run.locked_at = utcnow_naive()

    record_audit(
        db,
        actor=actor,
        action="payroll.lock",
        entity="payroll_runs",
        entity_id=run.id,
        after={
            "period": f"{run.period_year}-{run.period_month:02d}",
            "total_net": float(run.total_net),
            "employee_count": run.employee_count,
        },
    )
    db.commit()
    db.refresh(run)
    return run


def delete_run(db: Session, run_id: int, actor: User) -> None:
    run = get_run(db, run_id)
    if run.status != PayrollStatus.DRAFT:
        raise ConflictError("Only DRAFT runs can be deleted")
    record_audit(db, actor=actor, action="payroll.delete", entity="payroll_runs", entity_id=run.id)
    db.delete(run)
    db.commit()


# ---------- Payslips ----------
def get_or_generate_payslip(db: Session, *, detail_id: int, actor: Optional[User] = None) -> Payslip:
    detail = db.execute(
        select(PayrollDetail)
        .options(selectinload(PayrollDetail.run), selectinload(PayrollDetail.employee))
        .where(PayrollDetail.id == detail_id)
    ).scalar_one_or_none()
    if not detail:
        raise NotFoundError("Payroll detail not found")

    # Payslips are formal artifacts: only emitted once the run is LOCKED
    # (final, immutable, salaries credited). For DRAFT / REVIEW / APPROVED
    # runs the numbers can still change on a recompute, so issuing a slip is
    # both misleading to the employee and a paper-trail liability for HR.
    if detail.run.status != PayrollStatus.LOCKED:
        raise ConflictError(
            "Payslip will be available once the payroll run is locked. "
            f"Current status: {detail.run.status.value}."
        )

    payslip = db.scalar(select(Payslip).where(Payslip.payroll_detail_id == detail.id))
    if payslip and payslip.file_key and get_storage().exists(payslip.file_key):
        return payslip

    pdf_bytes = render_payslip_pdf(detail)
    key = f"payslips/{detail.run.period_year}/{detail.run.period_month:02d}/payslip_{detail.run_id}_{detail.employee_id}.pdf"
    get_storage().save(key, pdf_bytes, content_type="application/pdf")

    if not payslip:
        payslip = Payslip(
            payroll_detail_id=detail.id,
            employee_id=detail.employee_id,
            run_id=detail.run_id,
        )
        db.add(payslip)
    payslip.file_key = key
    payslip.generated_at = utcnow_naive()
    record_audit(
        db,
        actor=actor,
        action="payslip.generate",
        entity="payslips",
        entity_id=detail.id,
        after={"file_key": key},
    )
    db.commit()
    db.refresh(payslip)
    return payslip


def render_payslip_pdf(detail: PayrollDetail) -> bytes:
    """Render a clean printable HTML → PDF payslip. Falls back to HTML bytes
    if WeasyPrint isn't available (which is common on Windows without GTK).
    """
    from app.services.payslip_template import render_payslip_html

    html = render_payslip_html(detail)
    try:
        from weasyprint import HTML  # type: ignore

        return HTML(string=html).write_pdf()  # type: ignore[no-any-return]
    except Exception as exc:
        # Graceful fallback: store HTML so the system stays usable on platforms
        # where WeasyPrint's native deps aren't installed (e.g. Windows w/o GTK).
        logger.warning(
            "WeasyPrint unavailable (%s); generating HTML payslip fallback. "
            "Install GTK/WeasyPrint native deps for PDF output.",
            exc.__class__.__name__,
        )
        return html.encode("utf-8")


def latest_payslip_summary(db: Session, employee_id: int) -> Optional[dict]:
    """Most recent *finalized* (LOCKED) payroll detail for an employee, with the
    net pay and pay date — the data the employee dashboard's payslip card needs.
    Returns None when the employee has no locked pay run yet."""
    row = db.execute(
        select(PayrollDetail, PayrollRun)
        .join(PayrollRun, PayrollRun.id == PayrollDetail.run_id)
        .where(
            PayrollDetail.employee_id == employee_id,
            PayrollRun.status == PayrollStatus.LOCKED,
        )
        .order_by(desc(PayrollRun.period_year), desc(PayrollRun.period_month))
        .limit(1)
    ).first()
    if row is None:
        return None
    detail, run = row
    return {
        "run_id": run.id,
        "payroll_detail_id": detail.id,
        "period_year": run.period_year,
        "period_month": run.period_month,
        "net_pay": float(detail.net_pay),
        "status": "Paid",
        "paid_on": run.locked_at,
    }


def employee_payslips(db: Session, employee_id: int) -> list[Payslip]:
    return list(
        db.scalars(
            select(Payslip)
            .where(Payslip.employee_id == employee_id)
            .order_by(Payslip.generated_at.desc().nullslast(), Payslip.id.desc())
        )
    )
