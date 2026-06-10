"""Birthday page schemas."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class BirthdayItem(BaseModel):
    employee_id: int
    employee_code: str
    name: str
    work_email: str
    photo_url: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    date_of_birth: date
    day: int
    month: int
    turning_age: Optional[int] = None
    next_birthday: date
    days_until: int
    is_today: bool
    wished_this_year: bool
    wished_at: Optional[datetime] = None


class BirthdayWishResult(BaseModel):
    employee_id: int
    sent: bool
    already_wished: bool
    sent_to: Optional[str] = None
    wished_at: Optional[datetime] = None
    message: str
