"""Holiday calendar service."""
from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.exceptions import ConflictError, NotFoundError
from app.models.holiday import Holiday
from app.models.user import User
from app.schemas.holiday import HolidayCreate, HolidayUpdate


def list_holidays(db: Session, year: Optional[int] = None) -> list[Holiday]:
    stmt = select(Holiday)
    if year is not None:
        stmt = stmt.where(Holiday.year == year)
    return list(db.scalars(stmt.order_by(Holiday.date.asc())))


def upcoming(db: Session, *, today: date, limit: int = 5) -> list[Holiday]:
    return list(
        db.scalars(
            select(Holiday).where(Holiday.date >= today).order_by(Holiday.date.asc()).limit(limit)
        )
    )


def create(db: Session, payload: HolidayCreate, actor: Optional[User] = None) -> Holiday:
    exists = db.scalar(
        select(Holiday).where(Holiday.date == payload.date, Holiday.name == payload.name)
    )
    if exists:
        raise ConflictError("Holiday already exists for that date and name")
    h = Holiday(
        name=payload.name,
        date=payload.date,
        year=payload.date.year,
        type=payload.type,
        description=payload.description,
    )
    db.add(h)
    db.flush()
    record_audit(db, actor=actor, action="holiday.create", entity="holidays", entity_id=h.id, after=payload.model_dump(mode="json"))
    db.commit()
    db.refresh(h)
    return h


def update(db: Session, holiday_id: int, payload: HolidayUpdate, actor: Optional[User] = None) -> Holiday:
    h = db.get(Holiday, holiday_id)
    if not h:
        raise NotFoundError("Holiday not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(h, k, v)
    if "date" in data:
        h.year = h.date.year
    record_audit(db, actor=actor, action="holiday.update", entity="holidays", entity_id=h.id, after=data)
    db.commit()
    db.refresh(h)
    return h


def delete(db: Session, holiday_id: int, actor: Optional[User] = None) -> None:
    h = db.get(Holiday, holiday_id)
    if not h:
        raise NotFoundError("Holiday not found")
    record_audit(db, actor=actor, action="holiday.delete", entity="holidays", entity_id=h.id, before={"name": h.name, "date": str(h.date)})
    db.delete(h)
    db.commit()
