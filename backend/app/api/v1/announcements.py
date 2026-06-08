"""Announcement endpoints. Everyone reads; HR_ADMIN+ posts/removes."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_hr
from app.models.user import User
from app.schemas.announcement import AnnouncementCreate, AnnouncementOut
from app.schemas.common import Message
from app.services import announcement_service

router = APIRouter(prefix="/announcements", tags=["announcements"])


@router.get("", response_model=List[AnnouncementOut])
def list_announcements(
    db: Session = Depends(get_db), current: User = Depends(get_current_user)
):
    return announcement_service.list_announcements(db)


@router.post("", response_model=AnnouncementOut, status_code=201)
def create_announcement(
    payload: AnnouncementCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    return announcement_service.create_announcement(db, payload, actor=current)


@router.delete("/{announcement_id}", response_model=Message)
def delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    announcement_service.delete_announcement(db, announcement_id, actor=current)
    return Message(message="Deleted")
