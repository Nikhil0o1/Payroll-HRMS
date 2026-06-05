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
    PayrollStatus,
)
from app.models.holiday import Holiday
from app.models.payroll import PayrollDetail, PayrollRun, Payslip, SalaryStructure
from app.models.user import User
from app.schemas.payroll import (
    PayrollRunCreate,
    SalaryStructureCreate,
    SalaryStructureUpdate,
)
from app.services import attendance_service

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


# ---------- Payroll calculation ----------
def _round(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _working_days(db: Session, year: int, month: int) -> int:
    """Calendar days in month minus weekends and public holidays."""
    last = monthrange(year, month)[1]
    holidays = {
        h.date
        for h in db.scalars(
            select(Holiday).where(
                Holiday.year == year, func.extract("month", Holiday.date) == month
            )
        )
    }
    count = 0
    for d in range(1, last + 1):
        day = date(year, month, d)
        if day.weekday() in settings.WEEKEND_DAYS:
            continue
        if day in holidays:
            continue
        count += 1
    return count


def _attendance_for_employee(
    db: Session, employee_id: int, year: int, month: int
) -> Tuple[float, float, float]:
    """Return (present_days, paid_leave_days, lop_days) for a working month."""
    last = monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year, month, last)

    # Make sure the daily projection is up to date for that month.
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
    working = float(_working_days(db, year, month))
    accounted = present_days + paid_leave
    lop = max(0.0, working - accounted)
    return present_days, paid_leave, lop


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

    # Always include Basic as the first earning if not already listed.
    if not any(e["code"] == "BASIC" for e in earnings):
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

    working = float(_working_days(db, run.period_year, run.period_month))
    present, paid_leave, lop = _attendance_for_employee(
        db, employee.id, run.period_year, run.period_month
    )
    payable = max(0.0, working - lop)
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
    db.execute(
        update(AttendanceDaily)
        .where(AttendanceDaily.work_date >= start, AttendanceDaily.work_date <= end)
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


def employee_payslips(db: Session, employee_id: int) -> list[Payslip]:
    return list(
        db.scalars(
            select(Payslip)
            .where(Payslip.employee_id == employee_id)
            .order_by(Payslip.generated_at.desc().nullslast(), Payslip.id.desc())
        )
    )
