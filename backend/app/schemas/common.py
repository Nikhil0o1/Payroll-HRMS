"""Shared Pydantic primitives."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Generic, List, TypeVar

from pydantic import BaseModel, ConfigDict, PlainSerializer

from app.core.time import as_aware_utc

T = TypeVar("T")

# A datetime stored as naive-UTC that should be emitted with an explicit UTC
# offset so clients localise it correctly (e.g. punch times -> IST in the UI)
# instead of mistaking the UTC wall-clock for local time.
AwareUTCDatetime = Annotated[
    datetime, PlainSerializer(as_aware_utc, when_used="json")
]


class ORMModel(BaseModel):
    """Base for response models that read from ORM objects."""

    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    size: int
    pages: int


class Message(BaseModel):
    message: str


class IdResponse(BaseModel):
    id: int
