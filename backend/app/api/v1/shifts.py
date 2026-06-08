"""Shift management endpoints (HR_ADMIN+).

Admins define working shifts here; employees are assigned a shift via the
employee update endpoint (``PATCH /employees/{id}`` with ``shift_id``).
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_hr
from app.models.user import User
from app.schemas.common import Message
from app.schemas.shift import ShiftCreate, ShiftOut, ShiftUpdate
from app.services import shift_service

router = APIRouter(prefix="/shifts", tags=["shifts"])


def _to_out(shift, counts: dict[int, int]) -> ShiftOut:
    return ShiftOut.model_validate(shift).model_copy(
        update={"assigned_count": counts.get(shift.id, 0)}
    )


@router.get("", response_model=List[ShiftOut])
def list_shifts(db: Session = Depends(get_db), current: User = Depends(require_hr)):
    counts = shift_service.assigned_counts(db)
    return [_to_out(s, counts) for s in shift_service.list_shifts(db)]


@router.post("", response_model=ShiftOut, status_code=201)
def create_shift(
    payload: ShiftCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    sh = shift_service.create_shift(db, payload, actor=current)
    return _to_out(sh, shift_service.assigned_counts(db))


@router.patch("/{shift_id}", response_model=ShiftOut)
def update_shift(
    shift_id: int,
    payload: ShiftUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    sh = shift_service.update_shift(db, shift_id, payload, actor=current)
    return _to_out(sh, shift_service.assigned_counts(db))


@router.delete("/{shift_id}", response_model=Message)
def delete_shift(
    shift_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    shift_service.delete_shift(db, shift_id, actor=current)
    return Message(message="Deleted")
