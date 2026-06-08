"""Centralised time helpers.

The DB columns store timestamps *without* timezone (portable across SQLite and
PostgreSQL). To stay internally consistent and avoid the deprecated
``datetime.utcnow()``, all DB-bound timestamps go through ``utcnow_naive()`` —
a timezone-aware UTC instant with the tzinfo stripped. Use ``utcnow()`` when a
timezone-aware value is required (e.g. JWT claims).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone, tzinfo
from typing import Optional
from zoneinfo import ZoneInfo

from app.core.config import settings


def _resolve_tz(name: str) -> tzinfo:
    """Resolve a timezone name, tolerating platforms without the IANA tz
    database (e.g. Windows missing the ``tzdata`` package). IST is a fixed
    +05:30 with no DST, so it can fall back to a pure offset safely."""
    try:
        return ZoneInfo(name)
    except Exception:
        if name in ("Asia/Kolkata", "Asia/Calcutta"):
            return timezone(timedelta(hours=5, minutes=30), name="IST")
        raise


# Business timezone (e.g. Asia/Kolkata). Attendance times are stored as UTC and
# presented here; local-time policy (workday start, "today") is evaluated here.
APP_TZ = _resolve_tz(settings.APP_TIMEZONE)


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


def as_aware_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Tag a stored (naive-UTC) datetime as timezone-aware UTC so it serialises
    with an explicit offset (``...Z``). Clients can then localise it correctly
    instead of mistaking UTC for local time."""
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def to_app_tz(value: Optional[datetime]) -> Optional[datetime]:
    """Convert a stored (naive-UTC) datetime into the business timezone (aware)."""
    aware = as_aware_utc(value)
    return aware.astimezone(APP_TZ) if aware is not None else None


def app_now() -> datetime:
    """Current time in the business timezone (aware)."""
    return datetime.now(APP_TZ)
