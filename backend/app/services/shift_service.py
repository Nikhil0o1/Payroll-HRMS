"""Shift management: CRUD + resolution used by attendance & payroll.

V1 is deliberately simple — one active shift per employee, no rotating rosters.
Attendance calculation resolves an employee's effective shift via
``resolve_employee_shift`` (explicit assignment → org default → None, where None
means callers fall back to the global settings policy).
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.exceptions import ConflictError, NotFoundError
from app.models.employee import Employee
from app.models.shift import Shift
from app.models.user import User
from app.schemas.shift import ShiftCreate, ShiftUpdate


# ---------- Reads ----------
def list_shifts(db: Session) -> list[Shift]:
    return list(db.scalars(select(Shift).order_by(Shift.is_active.desc(), Shift.name)))


def assigned_counts(db: Session) -> dict[int, int]:
    rows = db.execute(
        select(Employee.shift_id, func.count(Employee.id))
        .where(Employee.shift_id.is_not(None))
        .group_by(Employee.shift_id)
    ).all()
    return {sid: n for sid, n in rows}


def get_shift(db: Session, shift_id: int) -> Shift:
    sh = db.get(Shift, shift_id)
    if not sh:
        raise NotFoundError("Shift not found")
    return sh


def get_default_shift(db: Session) -> Optional[Shift]:
    return db.scalar(
        select(Shift).where(Shift.is_default.is_(True), Shift.is_active.is_(True)).limit(1)
    )


def resolve_employee_shift(db: Session, employee_id: int) -> Optional[Shift]:
    """Effective shift for attendance calc: explicit assignment (if active),
    else the org default. Returns None when no shift is configured at all — the
    caller then falls back to the global settings policy (backwards compatible)."""
    emp = db.get(Employee, employee_id)
    if emp and emp.shift_id:
        sh = db.get(Shift, emp.shift_id)
        if sh and sh.is_active:
            return sh
    return get_default_shift(db)


# ---------- Writes ----------
def _clear_other_defaults(db: Session, keep_id: Optional[int]) -> None:
    stmt = update(Shift).values(is_default=False)
    if keep_id is not None:
        stmt = stmt.where(Shift.id != keep_id)
    db.execute(stmt)


def create_shift(db: Session, payload: ShiftCreate, actor: Optional[User] = None) -> Shift:
    name = payload.name.strip()
    if db.scalar(select(Shift).where(func.lower(Shift.name) == name.lower())):
        raise ConflictError(f"A shift named '{name}' already exists")
    sh = Shift(
        name=name,
        start_time=payload.start_time,
        end_time=payload.end_time,
        grace_minutes=payload.grace_minutes,
        full_day_minutes=payload.full_day_minutes,
        half_day_minutes=payload.half_day_minutes,
        weekly_offs=payload.weekly_offs,
        is_active=payload.is_active,
        is_default=payload.is_default,
    )
    db.add(sh)
    db.flush()
    if sh.is_default:
        _clear_other_defaults(db, keep_id=sh.id)
    record_audit(db, actor=actor, action="shift.create", entity="shifts", entity_id=sh.id,
                 after={"name": sh.name})
    db.commit()
    db.refresh(sh)
    return sh


def update_shift(db: Session, shift_id: int, payload: ShiftUpdate, actor: Optional[User] = None) -> Shift:
    sh = get_shift(db, shift_id)
    data = payload.model_dump(exclude_unset=True)

    if "name" in data and data["name"]:
        new_name = data["name"].strip()
        clash = db.scalar(
            select(Shift).where(func.lower(Shift.name) == new_name.lower(), Shift.id != shift_id)
        )
        if clash:
            raise ConflictError(f"A shift named '{new_name}' already exists")
        data["name"] = new_name

    # Cross-field threshold guard using the merged (current + incoming) values.
    full = data.get("full_day_minutes", sh.full_day_minutes)
    half = data.get("half_day_minutes", sh.half_day_minutes)
    if half > full:
        raise ConflictError("Half-day minutes cannot exceed full-day minutes")

    for k, v in data.items():
        setattr(sh, k, v)
    db.flush()
    if data.get("is_default"):
        _clear_other_defaults(db, keep_id=sh.id)
    record_audit(db, actor=actor, action="shift.update", entity="shifts", entity_id=sh.id, after=data)
    db.commit()
    db.refresh(sh)
    return sh


def delete_shift(db: Session, shift_id: int, actor: Optional[User] = None) -> None:
    sh = get_shift(db, shift_id)
    count = db.scalar(select(func.count(Employee.id)).where(Employee.shift_id == shift_id)) or 0
    if count > 0:
        raise ConflictError(
            f"Cannot delete '{sh.name}': {count} employee(s) are assigned to it. "
            "Reassign them to another shift first."
        )
    if sh.is_default:
        raise ConflictError("Cannot delete the default shift. Mark another shift as default first.")
    record_audit(db, actor=actor, action="shift.delete", entity="shifts", entity_id=sh.id,
                 before={"name": sh.name})
    db.delete(sh)
    db.commit()
