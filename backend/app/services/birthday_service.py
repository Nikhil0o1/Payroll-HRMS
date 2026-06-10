"""Birthday board: compute employee birthdays live from DOB, and send a
branded birthday-wish email (idempotent per employee per calendar year)."""
from __future__ import annotations

import logging
from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.config import settings
from app.core.exceptions import DomainError, NotFoundError
from app.core.time import app_now
from app.models.birthday import BirthdayWish
from app.models.employee import Employee, EmployeeProfile
from app.models.enums import EmployeeStatus
from app.models.organization import OrganizationProfile
from app.models.user import User
from app.services import email_service
from app.services.email_templates import birthday_wish as birthday_wish_tpl

log = logging.getLogger("hrms")


def _today() -> date:
    """Local (app-timezone) calendar date — birthdays follow the org's day."""
    return app_now().date()


def _next_birthday(dob: date, today: date) -> date:
    """Next occurrence of ``dob``'s day/month on or after ``today`` (Feb-29
    falls back to Feb-28 in non-leap years)."""
    def _on(year: int) -> date:
        try:
            return dob.replace(year=year)
        except ValueError:
            return date(year, 2, 28)

    candidate = _on(today.year)
    return candidate if candidate >= today else _on(today.year + 1)


def _org_name(db: Session) -> str:
    p = db.scalar(select(OrganizationProfile).order_by(OrganizationProfile.id).limit(1))
    return (p.name if p and p.name else None) or settings.EMAIL_FROM_NAME


def list_birthdays(db: Session) -> list[dict]:
    """All active employees with a DOB, ordered by their next birthday. Each
    item carries whether a wish has already been sent this calendar year."""
    today = _today()
    year = today.year

    rows = db.execute(
        select(Employee, EmployeeProfile)
        .join(EmployeeProfile, EmployeeProfile.employee_id == Employee.id)
        .where(
            Employee.status == EmployeeStatus.ACTIVE,
            EmployeeProfile.date_of_birth.is_not(None),
        )
    ).all()

    wished = {
        w.employee_id: w
        for w in db.scalars(select(BirthdayWish).where(BirthdayWish.year == year))
    }

    items: list[dict] = []
    for emp, profile in rows:
        dob = profile.date_of_birth
        nxt = _next_birthday(dob, today)
        is_today = nxt == today
        w = wished.get(emp.id)
        items.append(
            {
                "employee_id": emp.id,
                "employee_code": emp.employee_code,
                "name": emp.full_name,
                "work_email": emp.work_email,
                "photo_url": emp.photo_url,
                "designation": emp.designation,
                "department": emp.department,
                "date_of_birth": dob,
                "day": dob.day,
                "month": dob.month,
                "turning_age": nxt.year - dob.year if dob.year else None,
                "next_birthday": nxt,
                "days_until": (nxt - today).days,
                "is_today": is_today,
                "wished_this_year": w is not None,
                "wished_at": w.created_at if w else None,
            }
        )

    items.sort(key=lambda i: (i["days_until"], i["name"]))
    return items


def send_birthday_wish(
    db: Session, employee_id: int, *, actor: Optional[User] = None, force: bool = False
) -> dict:
    """Send (or re-send with ``force``) a birthday-wish email. Idempotent per
    calendar year — a second click without ``force`` is a no-op that reports the
    existing wish, so employees are never emailed twice."""
    emp = db.execute(
        select(Employee).where(Employee.id == employee_id)
    ).scalar_one_or_none()
    if emp is None:
        raise NotFoundError(f"Employee {employee_id} not found")

    to = (emp.work_email or "").strip()
    if not to:
        raise DomainError("This employee has no email address on file.", status_code=400)

    year = _today().year
    existing = db.scalar(
        select(BirthdayWish).where(
            BirthdayWish.employee_id == employee_id, BirthdayWish.year == year
        )
    )
    if existing is not None and not force:
        return {
            "employee_id": employee_id,
            "sent": False,
            "already_wished": True,
            "sent_to": existing.sent_to or to,
            "wished_at": existing.created_at,
            "message": f"{emp.first_name} was already wished this year.",
        }

    subject, html, text = birthday_wish_tpl(first_name=emp.first_name, org_name=_org_name(db))
    delivered = email_service.send_email(to=to, subject=subject, html=html, text=text)

    if existing is not None:
        existing.sent_to = to
        existing.delivered = delivered
        existing.sent_by_user_id = actor.id if actor else None
        record = existing
    else:
        record = BirthdayWish(
            employee_id=employee_id,
            year=year,
            channel="email",
            sent_to=to,
            delivered=delivered,
            sent_by_user_id=actor.id if actor else None,
        )
        db.add(record)

    record_audit(
        db,
        actor=actor,
        action="employee.birthday_wish_sent",
        entity="employees",
        entity_id=employee_id,
        after={"to": to, "year": year, "delivered": delivered},
    )
    db.commit()
    db.refresh(record)

    if not delivered:
        log.warning("Birthday wish for employee %s could not be delivered to %s", employee_id, to)

    return {
        "employee_id": employee_id,
        "sent": delivered,
        "already_wished": False,
        "sent_to": to,
        "wished_at": record.created_at,
        "message": (
            f"Birthday wishes sent to {emp.first_name}."
            if delivered
            else "Recorded, but the email could not be delivered (check mail settings)."
        ),
    }
