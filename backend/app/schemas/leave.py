"""Leave schemas."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.models.enums import LeaveStatus
from app.schemas.common import ORMModel


class LeaveTypeBase(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=80)
    default_annual_quota: float = 0
    is_paid: bool = True
    color: Optional[str] = None


class LeaveTypeCreate(LeaveTypeBase):
    pass


class LeaveTypeUpdate(BaseModel):
    name: Optional[str] = None
    default_annual_quota: Optional[float] = None
    is_paid: Optional[bool] = None
    color: Optional[str] = None


class LeaveTypeOut(LeaveTypeBase, ORMModel):
    id: int


class LeaveBalanceOut(ORMModel):
    id: int
    employee_id: int
    leave_type_id: int
    year: int
    allotted: float
    used: float
    pending: float
    available: float
    leave_type: Optional[LeaveTypeOut] = None


class LeaveRequestCreate(BaseModel):
    leave_type_id: int
    start_date: date
    end_date: date
    half_day: bool = False
    reason: Optional[str] = None

    @field_validator("end_date")
    @classmethod
    def _end_after_start(cls, v: date, info):
        start = info.data.get("start_date")
        if start and v < start:
            raise ValueError("end_date must be on or after start_date")
        return v


class LeaveDecision(BaseModel):
    decision_note: Optional[str] = None


class LeaveRejection(BaseModel):
    """Reject schema — the decision note (reason) is mandatory so the
    employee always sees *why* their request was declined."""

    decision_note: str = Field(min_length=2, max_length=500)

    @field_validator("decision_note")
    @classmethod
    def _strip_and_require(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) < 2:
            raise ValueError("Please provide a reason for rejection.")
        return v


class LeaveRequestOut(ORMModel):
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None
    leave_type_id: int
    start_date: date
    end_date: date
    days: float
    half_day: bool
    reason: Optional[str] = None
    status: LeaveStatus
    approver_user_id: Optional[int] = None
    decided_at: Optional[datetime] = None
    decision_note: Optional[str] = None
    created_at: Optional[datetime] = None
    leave_type: Optional[LeaveTypeOut] = None
