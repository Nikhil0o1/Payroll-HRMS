"""Centralised time helpers.

The DB columns store timestamps *without* timezone (portable across SQLite and
PostgreSQL). To stay internally consistent and avoid the deprecated
``datetime.utcnow()``, all DB-bound timestamps go through ``utcnow_naive()`` —
a timezone-aware UTC instant with the tzinfo stripped. Use ``utcnow()`` when a
timezone-aware value is required (e.g. JWT claims).
"""
from __future__ import annotations

from datetime import datetime, timezone


def utcnow() -> datetime:
    """Timezone-aware current UTC time."""
    return datetime.now(timezone.utc)


def utcnow_naive() -> datetime:
    """Naive UTC time (tzinfo stripped) for storage in tz-naive DB columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def as_naive_utc(value: datetime) -> datetime:
    """Normalise any datetime to naive UTC for safe comparison with stored values."""
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value
