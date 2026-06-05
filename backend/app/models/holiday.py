"""Company holiday calendar."""
from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import Date, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import HolidayType
from app.models.types import enum_column


class Holiday(Base):
    __tablename__ = "holidays"
    __table_args__ = (UniqueConstraint("date", "name", name="uq_holiday_date_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    date: Mapped[date] = mapped_column(Date, index=True)
    year: Mapped[int] = mapped_column(Integer, index=True)
    type: Mapped[HolidayType] = mapped_column(enum_column(HolidayType), default=HolidayType.PUBLIC)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
