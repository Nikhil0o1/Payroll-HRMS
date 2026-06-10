"""Birthday board endpoints (HR admin)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_hr
from app.models.user import User
from app.schemas.birthday import BirthdayItem, BirthdayWishResult
from app.services import birthday_service

router = APIRouter(prefix="/birthdays", tags=["birthdays"])


@router.get("", response_model=list[BirthdayItem])
def list_birthdays(
    db: Session = Depends(get_db), current: User = Depends(require_hr)
) -> list[BirthdayItem]:
    """All active employees' birthdays (live from DOB), ordered by next
    birthday, with this-year wish status."""
    return [BirthdayItem.model_validate(i) for i in birthday_service.list_birthdays(db)]


@router.post("/{employee_id}/send", response_model=BirthdayWishResult)
def send_wish(
    employee_id: int,
    force: bool = False,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
) -> BirthdayWishResult:
    """Send a birthday-wish email to the employee. Idempotent per calendar year
    unless ``force=true``."""
    return BirthdayWishResult.model_validate(
        birthday_service.send_birthday_wish(db, employee_id, actor=current, force=force)
    )
