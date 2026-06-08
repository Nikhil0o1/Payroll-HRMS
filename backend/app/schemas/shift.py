"""Shift schemas."""
from __future__ import annotations

from datetime import time
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import ORMModel

_WEEKDAYS = {0, 1, 2, 3, 4, 5, 6}  # Mon=0 … Sun=6


class ShiftBase(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    start_time: time
    end_time: time
    grace_minutes: int = Field(default=10, ge=0, le=240)
    full_day_minutes: int = Field(default=480, ge=1, le=1440)
    half_day_minutes: int = Field(default=240, ge=1, le=1440)
    weekly_offs: List[int] = Field(default_factory=lambda: [5, 6])
    is_active: bool = True
    is_default: bool = False

    @field_validator("weekly_offs")
    @classmethod
    def _valid_weekdays(cls, v: List[int]) -> List[int]:
        cleaned = sorted({int(d) for d in v})
        if any(d not in _WEEKDAYS for d in cleaned):
            raise ValueError("weekly_offs must be weekday indices 0 (Mon) … 6 (Sun)")
        return cleaned

    @model_validator(mode="after")
    def _check_thresholds(self):
        if self.half_day_minutes > self.full_day_minutes:
            raise ValueError("half_day_minutes cannot exceed full_day_minutes")
        return self


class ShiftCreate(ShiftBase):
    pass


class ShiftUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    grace_minutes: Optional[int] = Field(default=None, ge=0, le=240)
    full_day_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    half_day_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    weekly_offs: Optional[List[int]] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None

    @field_validator("weekly_offs")
    @classmethod
    def _valid_weekdays(cls, v: Optional[List[int]]) -> Optional[List[int]]:
        if v is None:
            return v
        cleaned = sorted({int(d) for d in v})
        if any(d not in _WEEKDAYS for d in cleaned):
            raise ValueError("weekly_offs must be weekday indices 0 (Mon) … 6 (Sun)")
        return cleaned


class ShiftOut(ShiftBase, ORMModel):
    id: int
    # Number of employees currently assigned (populated by the service layer).
    assigned_count: int = 0
