"""Announcement schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    body: str = Field(min_length=2, max_length=2000)


class AnnouncementOut(ORMModel):
    id: int
    title: str
    body: str
    created_at: Optional[datetime] = None
    created_by_name: Optional[str] = None
