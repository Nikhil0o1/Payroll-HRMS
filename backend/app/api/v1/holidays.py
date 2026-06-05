"""Holiday endpoints."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_hr
from app.models.user import User
from app.schemas.common import Message
from app.schemas.holiday import HolidayCreate, HolidayOut, HolidayUpdate
from app.services import holiday_service

router = APIRouter(prefix="/holidays", tags=["holidays"])


@router.get("", response_model=list[HolidayOut])
def list_holidays(
    year: Optional[int] = None, db: Session = Depends(get_db), current: User = Depends(get_current_user)
):
    return [HolidayOut.model_validate(h) for h in holiday_service.list_holidays(db, year)]


@router.post("", response_model=HolidayOut, status_code=201)
def create(payload: HolidayCreate, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    return HolidayOut.model_validate(holiday_service.create(db, payload, actor=current))


@router.patch("/{holiday_id}", response_model=HolidayOut)
def update(
    holiday_id: int,
    payload: HolidayUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    return HolidayOut.model_validate(holiday_service.update(db, holiday_id, payload, actor=current))


@router.delete("/{holiday_id}", response_model=Message)
def delete(holiday_id: int, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    holiday_service.delete(db, holiday_id, actor=current)
    return Message(message="Deleted")
