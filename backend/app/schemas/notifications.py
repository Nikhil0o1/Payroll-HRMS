"""Pydantic schemas for the notifications feed."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

Severity = Literal["info", "success", "warning"]


class NotificationOut(BaseModel):
    id: str
    kind: str
    severity: Severity
    title: str
    description: str
    href: Optional[str] = None
    timestamp: datetime
    actor: Optional[str] = None


class NotificationsResponse(BaseModel):
    items: list[NotificationOut]
    # Total count is just `len(items)` — kept as a separate field so the
    # client can render a badge without re-counting.
    total: int
