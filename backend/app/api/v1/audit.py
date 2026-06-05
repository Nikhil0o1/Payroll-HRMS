"""Audit log read endpoints. Append-only — no write/delete API."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_hr
from app.core.pagination import PageParams, build_page, paginate
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogOut
from app.schemas.common import Page

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("", response_model=Page[AuditLogOut])
def list_logs(
    entity: Optional[str] = None,
    action: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    params: PageParams = Depends(),
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    stmt = select(AuditLog)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if actor_user_id:
        stmt = stmt.where(AuditLog.actor_user_id == actor_user_id)
    stmt = stmt.order_by(AuditLog.id.desc())
    rows, total = paginate(db, stmt, params)
    return build_page([AuditLogOut.model_validate(r) for r in rows], total, params)
