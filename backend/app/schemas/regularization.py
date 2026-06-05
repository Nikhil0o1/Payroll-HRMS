"""Regularization schemas."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import RegularizationStatus, RegularizationType
from app.schemas.common import ORMModel


class RegularizationCreate(BaseModel):
    work_date: date
    type: RegularizationType
    requested_in: Optional[datetime] = None
    requested_out: Optional[datetime] = None
    reason: str = Field(min_length=4, max_length=500)

    @model_validator(mode="after")
    def _at_least_one_time(self):
        if self.type in {RegularizationType.MISSING_IN, RegularizationType.WRONG_TIME} and not self.requested_in:
            raise ValueError("requested_in is required for this regularization type")
        if self.type in {RegularizationType.MISSING_OUT, RegularizationType.WRONG_TIME} and not self.requested_out:
            raise ValueError("requested_out is required for this regularization type")
        return self


class RegularizationDecision(BaseModel):
    decision_note: Optional[str] = None


class RegularizationRejection(BaseModel):
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


class RegularizationOut(ORMModel):
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None
    work_date: date
    type: RegularizationType
    requested_in: Optional[datetime] = None
    requested_out: Optional[datetime] = None
    reason: str
    status: RegularizationStatus
    reviewer_user_id: Optional[int] = None
    decided_at: Optional[datetime] = None
    decision_note: Optional[str] = None
    created_at: Optional[datetime] = None
