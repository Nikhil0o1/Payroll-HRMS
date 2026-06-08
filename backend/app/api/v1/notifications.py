"""Notifications feed — derived from existing data, role-aware."""
from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.notifications import NotificationOut, NotificationsResponse
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationsResponse)
def list_notifications(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> NotificationsResponse:
    """Return the bell-icon feed for the calling user.

    The shape of the feed depends on the user's role:

    * **Admins / Managers** see actionable items — pending leave requests,
      pending regularizations, pending bank-detail change requests, payroll
      runs in REVIEW, upcoming holidays, and the latest announcements.
    * **Employees** see decisions on their own requests, new payslips, the
      same upcoming-holiday and announcement entries.
    """
    feed = notification_service.for_user(db, current)
    items = [NotificationOut(**asdict(n)) for n in feed]
    return NotificationsResponse(items=items, total=len(items))
