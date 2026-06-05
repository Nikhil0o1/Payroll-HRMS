"""Append-only audit logging helper.

Call `record_audit(...)` from services on every sensitive mutation. Audit rows
are never updated or deleted by the application.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.user import User


def _jsonable(value: Any) -> Any:
    """Best-effort conversion of values to JSON-serialisable primitives."""
    if value is None or isinstance(value, (str, int, float, bool, list, dict)):
        return value
    return str(value)


def record_audit(
    db: Session,
    *,
    actor: Optional[User],
    action: str,
    entity: str,
    entity_id: Optional[Any] = None,
    before: Optional[dict] = None,
    after: Optional[dict] = None,
    ip: Optional[str] = None,
    commit: bool = False,
) -> AuditLog:
    log = AuditLog(
        actor_user_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        action=action,
        entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None,
        before={k: _jsonable(v) for k, v in before.items()} if before else None,
        after={k: _jsonable(v) for k, v in after.items()} if after else None,
        ip=ip,
    )
    db.add(log)
    if commit:
        db.commit()
    return log
