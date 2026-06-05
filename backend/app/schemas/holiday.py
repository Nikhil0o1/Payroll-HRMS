"""Holiday schemas."""
from __future__ import annotations

from datetime import date as _date
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import HolidayType
from app.schemas.common import ORMModel


class HolidayCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    date: _date
    type: HolidayType = HolidayType.PUBLIC
    description: Optional[str] = None


class HolidayUpdate(BaseModel):
    name: Optional[str] = None
    date: Optional[_date] = None
    type: Optional[HolidayType] = None
    description: Optional[str] = None


class HolidayOut(ORMModel):
    id: int
    name: str
    date: _date
    year: int
    type: HolidayType
    description: Optional[str] = None
