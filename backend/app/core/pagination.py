"""Pagination helpers for list endpoints."""
from __future__ import annotations

from typing import Generic, List, TypeVar

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

T = TypeVar("T")


class PageParams:
    """Query params for pagination/search; use as a FastAPI dependency."""

    def __init__(
        self,
        page: int = Query(1, ge=1),
        size: int = Query(20, ge=1, le=100),
        q: str | None = Query(None, description="Free-text search"),
    ):
        self.page = page
        self.size = size
        self.q = q.strip() if q else None

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size


class Page(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    size: int
    pages: int


def paginate(db: Session, stmt, params: PageParams) -> tuple[list, int]:
    """Return (rows, total) for a SELECT statement given page params."""
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(stmt.offset(params.offset).limit(params.size)).scalars().all()
    return list(rows), int(total)


def build_page(items: list, total: int, params: PageParams) -> dict:
    pages = (total + params.size - 1) // params.size if params.size else 0
    return {
        "items": items,
        "total": total,
        "page": params.page,
        "size": params.size,
        "pages": pages,
    }
