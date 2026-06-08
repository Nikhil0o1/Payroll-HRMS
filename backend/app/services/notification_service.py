"""Role-aware notifications, derived from existing data.

Why no dedicated `notifications` table: every meaningful notification in this
product is already a row in another table (a pending leave request, a payroll
run waiting for approval, a freshly-locked payslip, …). Persisting separate
notification records would duplicate that state and drift out of sync.

So this service builds a small, sorted feed on every call. Cheap (a few
indexed queries, capped result sizes), always in sync with the source of
truth, and zero migrations needed.

Read state ("seen" vs. "unseen") is tracked on the client in localStorage by
comparing each item's timestamp to ``notifications.lastSeenAt``. That's the
right home for a per-user, per-device flag — the server doesn't care.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.announcement import Announcement
from app.models.employee import Employee, EmployeeBankDetailChangeRequest
from app.models.enums import (
    BankDetailChangeStatus,
    LeaveStatus,
    PayrollStatus,
    RegularizationStatus,
    RoleName,
)
from app.models.holiday import Holiday
from app.models.leave import LeaveRequest, LeaveType
from app.models.payroll import PayrollRun, Payslip
from app.models.regularization import RegularizationRequest
from app.models.user import User

Severity = Literal["info", "success", "warning"]

# How far back to surface decided items / new payslips on the employee feed.
RECENT_DECISION_WINDOW = timedelta(days=14)
# How many days ahead to consider a holiday "upcoming".
UPCOMING_HOLIDAY_WINDOW_DAYS = 14
# Cap each individual category so the feed stays scannable.
_PER_KIND_CAP = 5


@dataclass(slots=True)
class Notification:
    id: str
    kind: str
    severity: Severity
    title: str
    description: str
    href: Optional[str]
    timestamp: datetime
    actor: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────


def _coerce_dt(value) -> datetime:
    """Promote dates / Nones to a sortable naive datetime."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    return utcnow_naive()


def _short_name(emp: Optional[Employee]) -> str:
    if emp is None:
        return "An employee"
    return emp.full_name or emp.work_email or f"Employee #{emp.id}"


def _format_period(year: int, month: int) -> str:
    import calendar

    return f"{calendar.month_name[month]} {year}"


def _is_admin(user: User) -> bool:
    return user.role_name in {RoleName.HR_ADMIN, RoleName.SUPER_ADMIN}


def _is_manager(user: User) -> bool:
    return user.role_name == RoleName.MANAGER


# ── Admin feed ─────────────────────────────────────────────────────────────


def _admin_pending_leaves(db: Session) -> list[Notification]:
    rows = list(
        db.scalars(
            select(LeaveRequest)
            .where(LeaveRequest.status == LeaveStatus.PENDING)
            .order_by(LeaveRequest.id.desc())
            .limit(_PER_KIND_CAP)
        )
    )
    out: list[Notification] = []
    for r in rows:
        lt: Optional[LeaveType] = r.leave_type
        type_name = lt.name if lt else "Leave"
        days = float(r.days) if r.days is not None else 0
        out.append(
            Notification(
                id=f"leave-pending-{r.id}",
                kind="leave.pending",
                severity="warning",
                title=f"{_short_name(r.employee)} requested {type_name}",
                description=(
                    f"{days:g} day(s) starting {r.start_date.strftime('%d %b %Y')}"
                    + (f" — {r.reason.strip()[:80]}" if r.reason else "")
                ),
                href="/leaves",
                timestamp=_coerce_dt(r.created_at),
                actor=_short_name(r.employee),
            )
        )
    return out


def _admin_pending_regularizations(db: Session) -> list[Notification]:
    rows = list(
        db.scalars(
            select(RegularizationRequest)
            .where(RegularizationRequest.status == RegularizationStatus.PENDING)
            .order_by(RegularizationRequest.id.desc())
            .limit(_PER_KIND_CAP)
        )
    )
    return [
        Notification(
            id=f"reg-pending-{r.id}",
            kind="regularization.pending",
            severity="warning",
            title=f"{_short_name(r.employee)} requested attendance correction",
            description=(
                f"{r.type.value.replace('_', ' ').title()} on "
                f"{r.work_date.strftime('%d %b %Y')}"
            ),
            href="/regularizations",
            timestamp=_coerce_dt(r.created_at),
            actor=_short_name(r.employee),
        )
        for r in rows
    ]


def _admin_pending_bank_changes(db: Session) -> list[Notification]:
    rows = list(
        db.scalars(
            select(EmployeeBankDetailChangeRequest)
            .where(EmployeeBankDetailChangeRequest.status == BankDetailChangeStatus.PENDING)
            .order_by(EmployeeBankDetailChangeRequest.id.desc())
            .limit(_PER_KIND_CAP)
        )
    )
    return [
        Notification(
            id=f"bank-change-{r.id}",
            kind="bank_change.pending",
            severity="warning",
            title=f"{_short_name(r.employee)} requested a bank-detail change",
            description="Approve in the employee's profile to take effect on the next payroll.",
            href=f"/employees/{r.employee_id}",
            timestamp=_coerce_dt(r.created_at),
            actor=_short_name(r.employee),
        )
        for r in rows
    ]


def _admin_payroll_review(db: Session) -> list[Notification]:
    rows = list(
        db.scalars(
            select(PayrollRun)
            .where(PayrollRun.status == PayrollStatus.REVIEW)
            .order_by(PayrollRun.period_year.desc(), PayrollRun.period_month.desc())
            .limit(_PER_KIND_CAP)
        )
    )
    return [
        Notification(
            id=f"payroll-review-{r.id}",
            kind="payroll.review",
            severity="info",
            title=f"Payroll for {_format_period(r.period_year, r.period_month)} awaits approval",
            description="Submit, approve, or recompute the run from the Pay Runs page.",
            href=f"/payroll/runs/{r.id}",
            timestamp=_coerce_dt(r.updated_at or r.created_at),
        )
        for r in rows
    ]


def _admin_recent_announcements(db: Session) -> list[Notification]:
    rows = list(
        db.scalars(
            select(Announcement)
            .where(Announcement.is_active.is_(True))
            .order_by(Announcement.id.desc())
            .limit(3)
        )
    )
    return [
        Notification(
            id=f"announcement-{a.id}",
            kind="announcement",
            severity="info",
            title=a.title,
            description=(a.body or "").strip()[:120],
            href="/settings/announcements",
            timestamp=_coerce_dt(a.created_at),
        )
        for a in rows
    ]


def _upcoming_holidays(db: Session) -> list[Notification]:
    today = utcnow_naive().date()
    horizon = today + timedelta(days=UPCOMING_HOLIDAY_WINDOW_DAYS)
    rows = list(
        db.scalars(
            select(Holiday)
            .where(Holiday.date >= today, Holiday.date <= horizon)
            .order_by(Holiday.date.asc())
            .limit(_PER_KIND_CAP)
        )
    )
    out: list[Notification] = []
    for h in rows:
        delta = (h.date - today).days
        when = "Today" if delta == 0 else "Tomorrow" if delta == 1 else f"in {delta} days"
        out.append(
            Notification(
                id=f"holiday-{h.id}",
                kind="holiday.upcoming",
                severity="info",
                title=f"{h.name} — {when}",
                description=h.date.strftime("%A, %d %b %Y"),
                href="/holidays",
                # Use the holiday date as the timestamp so it sorts naturally
                # ahead of decided items (closer = higher in feed).
                timestamp=_coerce_dt(h.date),
            )
        )
    return out


def _admin_feed(db: Session) -> list[Notification]:
    return [
        *_admin_pending_leaves(db),
        *_admin_pending_regularizations(db),
        *_admin_pending_bank_changes(db),
        *_admin_payroll_review(db),
        *_upcoming_holidays(db),
        *_admin_recent_announcements(db),
    ]


# ── Employee feed ──────────────────────────────────────────────────────────


def _employee_recent_leaves(db: Session, employee_id: int) -> list[Notification]:
    cutoff = utcnow_naive() - RECENT_DECISION_WINDOW
    rows = list(
        db.scalars(
            select(LeaveRequest)
            .where(
                LeaveRequest.employee_id == employee_id,
                LeaveRequest.status.in_(
                    [LeaveStatus.APPROVED, LeaveStatus.REJECTED]
                ),
                LeaveRequest.decided_at.is_not(None),
                LeaveRequest.decided_at >= cutoff,
            )
            .order_by(LeaveRequest.decided_at.desc())
            .limit(_PER_KIND_CAP)
        )
    )
    out: list[Notification] = []
    for r in rows:
        approved = r.status == LeaveStatus.APPROVED
        lt: Optional[LeaveType] = r.leave_type
        type_name = lt.name if lt else "Leave"
        days = float(r.days) if r.days is not None else 0
        out.append(
            Notification(
                id=f"leave-decided-{r.id}",
                kind="leave.approved" if approved else "leave.rejected",
                severity="success" if approved else "warning",
                title=(
                    f"{type_name} approved"
                    if approved
                    else f"{type_name} rejected"
                ),
                description=(
                    f"{days:g} day(s) from {r.start_date.strftime('%d %b')}"
                    + (f" — {r.decision_note.strip()[:120]}" if r.decision_note else "")
                ),
                href="/leaves",
                timestamp=_coerce_dt(r.decided_at),
            )
        )
    return out


def _employee_recent_regularizations(
    db: Session, employee_id: int
) -> list[Notification]:
    cutoff = utcnow_naive() - RECENT_DECISION_WINDOW
    rows = list(
        db.scalars(
            select(RegularizationRequest)
            .where(
                RegularizationRequest.employee_id == employee_id,
                RegularizationRequest.status.in_(
                    [RegularizationStatus.APPROVED, RegularizationStatus.REJECTED]
                ),
                RegularizationRequest.decided_at.is_not(None),
                RegularizationRequest.decided_at >= cutoff,
            )
            .order_by(RegularizationRequest.decided_at.desc())
            .limit(_PER_KIND_CAP)
        )
    )
    out: list[Notification] = []
    for r in rows:
        approved = r.status == RegularizationStatus.APPROVED
        out.append(
            Notification(
                id=f"reg-decided-{r.id}",
                kind="regularization.approved" if approved else "regularization.rejected",
                severity="success" if approved else "warning",
                title=(
                    "Attendance correction approved"
                    if approved
                    else "Attendance correction rejected"
                ),
                description=(
                    f"{r.work_date.strftime('%d %b %Y')}"
                    + (f" — {r.decision_note.strip()[:120]}" if r.decision_note else "")
                ),
                href="/regularizations",
                timestamp=_coerce_dt(r.decided_at),
            )
        )
    return out


def _employee_new_payslips(db: Session, employee_id: int) -> list[Notification]:
    cutoff = utcnow_naive() - RECENT_DECISION_WINDOW
    rows = list(
        db.execute(
            select(Payslip, PayrollRun)
            .join(PayrollRun, Payslip.run_id == PayrollRun.id)
            .where(
                Payslip.employee_id == employee_id,
                PayrollRun.status == PayrollStatus.LOCKED,
                PayrollRun.locked_at.is_not(None),
                PayrollRun.locked_at >= cutoff,
            )
            .order_by(PayrollRun.locked_at.desc())
            .limit(_PER_KIND_CAP)
        ).all()
    )
    return [
        Notification(
            id=f"payslip-{ps.id}",
            kind="payslip.new",
            severity="success",
            title=f"Payslip for {_format_period(run.period_year, run.period_month)} is ready",
            description="Download or share from the Payslips page.",
            href="/payslips",
            timestamp=_coerce_dt(run.locked_at),
        )
        for ps, run in rows
    ]


def _employee_active_announcements(db: Session) -> list[Notification]:
    # Same source as the admin "recent announcements" — employees see them too,
    # capped to the most recent 3.
    return _admin_recent_announcements(db)


def _employee_feed(db: Session, employee_id: Optional[int]) -> list[Notification]:
    items: list[Notification] = []
    if employee_id is not None:
        items.extend(_employee_recent_leaves(db, employee_id))
        items.extend(_employee_recent_regularizations(db, employee_id))
        items.extend(_employee_new_payslips(db, employee_id))
    items.extend(_upcoming_holidays(db))
    items.extend(_employee_active_announcements(db))
    return items


# ── Public entry point ─────────────────────────────────────────────────────


def for_user(db: Session, user: User) -> list[Notification]:
    """Return the user's notification feed, sorted newest-first."""
    if _is_admin(user) or _is_manager(user):
        feed = _admin_feed(db)
    else:
        feed = _employee_feed(db, user.employee_id)
    feed.sort(key=lambda n: n.timestamp, reverse=True)
    return feed
