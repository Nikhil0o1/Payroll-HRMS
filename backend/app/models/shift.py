"""Shift model.

A Shift defines the working-time policy used by attendance calculation:
start/end (local business-tz wall clock), a grace window for lateness, the
minute thresholds for full/half day, and the weekly-off days. V1 is a simple,
static assignment — one active shift per employee, no rotating rosters.
"""
from __future__ import annotations

from datetime import time
from typing import List

from sqlalchemy import JSON, Boolean, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Shift(Base):
    __tablename__ = "shifts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, index=True)

    # Local (business-tz) wall-clock times, e.g. 09:30 / 18:30.
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)

    grace_minutes: Mapped[int] = mapped_column(Integer, default=10)
    full_day_minutes: Mapped[int] = mapped_column(Integer, default=480)
    half_day_minutes: Mapped[int] = mapped_column(Integer, default=240)

    # Weekly offs as weekday ints (Mon=0 … Sun=6), e.g. [5, 6] = Sat, Sun.
    weekly_offs: Mapped[List[int]] = mapped_column(JSON, default=list)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    # The fallback shift applied to employees with no explicit assignment, and
    # auto-assigned to new employees. Exactly one shift should be the default.
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    # created_at / updated_at are inherited from Base.
