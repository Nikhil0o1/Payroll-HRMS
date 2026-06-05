"""Audit log schema."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from app.schemas.common import ORMModel


class AuditLogOut(ORMModel):
    id: int
    actor_user_id: Optional[int] = None
    actor_email: Optional[str] = None
    action: str
    entity: str
    entity_id: Optional[str] = None
    before: Optional[dict] = None
    after: Optional[dict] = None
    ip: Optional[str] = None
    created_at: Optional[datetime] = None
