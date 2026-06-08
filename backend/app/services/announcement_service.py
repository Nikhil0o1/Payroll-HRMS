"""Company announcement CRUD (HR posts; everyone reads)."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import record_audit
from app.core.exceptions import NotFoundError
from app.models.announcement import Announcement
from app.models.user import User
from app.schemas.announcement import AnnouncementCreate, AnnouncementOut


def _to_out(a: Announcement) -> AnnouncementOut:
    creator = None
    if a.created_by is not None:
        emp = getattr(a.created_by, "employee", None)
        creator = emp.full_name if emp else a.created_by.email
    return AnnouncementOut(
        id=a.id,
        title=a.title,
        body=a.body,
        created_at=a.created_at,
        created_by_name=creator,
    )


def list_announcements(db: Session, *, limit: int = 10) -> list[AnnouncementOut]:
    rows = db.scalars(
        select(Announcement)
        .options(selectinload(Announcement.created_by).selectinload(User.employee))
        .where(Announcement.is_active.is_(True))
        .order_by(Announcement.created_at.desc(), Announcement.id.desc())
        .limit(limit)
    )
    return [_to_out(a) for a in rows]


def create_announcement(
    db: Session, payload: AnnouncementCreate, actor: Optional[User] = None
) -> AnnouncementOut:
    a = Announcement(
        title=payload.title.strip(),
        body=payload.body.strip(),
        is_active=True,
        created_by_user_id=actor.id if actor else None,
    )
    db.add(a)
    db.flush()
    record_audit(
        db, actor=actor, action="announcement.create", entity="announcements", entity_id=a.id,
        after={"title": a.title},
    )
    db.commit()
    # Reload with creator relationship for the response.
    a = db.scalar(
        select(Announcement)
        .options(selectinload(Announcement.created_by).selectinload(User.employee))
        .where(Announcement.id == a.id)
    )
    return _to_out(a)


def delete_announcement(db: Session, announcement_id: int, actor: Optional[User] = None) -> None:
    a = db.get(Announcement, announcement_id)
    if not a:
        raise NotFoundError("Announcement not found")
    record_audit(
        db, actor=actor, action="announcement.delete", entity="announcements", entity_id=a.id,
        before={"title": a.title},
    )
    db.delete(a)
    db.commit()
