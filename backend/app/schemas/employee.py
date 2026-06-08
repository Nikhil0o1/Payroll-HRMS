"""Employee schemas."""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import validate_password_strength
from app.models.enums import BankDetailChangeStatus, EmployeeStatus, EmploymentType, RoleName
from app.schemas.common import ORMModel


class EmergencyContact(BaseModel):
    name: str
    relationship: str
    phone: str


class EmployeeProfileBase(BaseModel):
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_name: Optional[str] = None
    pan: Optional[str] = None
    emergency_contacts: Optional[List[EmergencyContact]] = None


class EmployeeProfileOut(EmployeeProfileBase, ORMModel):
    id: int
    employee_id: int
    bank_account_last4: Optional[str] = None
    pending_bank_detail_change: bool = False


class EmployeeProfileUpdate(EmployeeProfileBase):
    # Employee-level contact details, editable via self-service profile.
    # (These live on the Employee row, not the profile — the service routes them.)
    personal_email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=32)


class BankDetailChangeRequestOut(ORMModel):
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None
    requested_by_user_id: Optional[int] = None
    reviewed_by_user_id: Optional[int] = None
    status: BankDetailChangeStatus
    changes: List[str] = []
    bank_account_no: Optional[str] = None
    bank_account_last4: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_name: Optional[str] = None
    decision_note: Optional[str] = None
    decided_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class BankDetailChangeDecision(BaseModel):
    note: Optional[str] = Field(default=None, max_length=500)


class BankAccountRevealOut(BaseModel):
    employee_id: int
    bank_account_no: Optional[str] = None
    bank_account_no_masked: Optional[str] = None


class EmployeeBase(BaseModel):
    employee_code: Optional[str] = Field(default=None, max_length=32)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    work_email: EmailStr
    personal_email: Optional[EmailStr] = None
    phone: Optional[str] = None
    date_of_joining: date
    date_of_exit: Optional[date] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    manager_id: Optional[int] = None
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    status: EmployeeStatus = EmployeeStatus.ACTIVE


class EmployeeCreate(EmployeeBase):
    create_user: bool = True
    role: RoleName = RoleName.EMPLOYEE
    initial_password: Optional[str] = Field(default=None, min_length=8, max_length=128)

    @field_validator("initial_password")
    @classmethod
    def _validate_initial_password(cls, v: Optional[str]) -> Optional[str]:
        # If omitted, the service generates a strong random password.
        return validate_password_strength(v) if v else v


class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    work_email: Optional[EmailStr] = None
    personal_email: Optional[EmailStr] = None
    phone: Optional[str] = None
    date_of_joining: Optional[date] = None
    date_of_exit: Optional[date] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    manager_id: Optional[int] = None
    shift_id: Optional[int] = None
    employment_type: Optional[EmploymentType] = None
    status: Optional[EmployeeStatus] = None


class EmployeeListItem(ORMModel):
    id: int
    employee_code: str
    first_name: str
    last_name: str
    work_email: str
    department: Optional[str] = None
    designation: Optional[str] = None
    employment_type: EmploymentType
    status: EmployeeStatus
    date_of_joining: date
    manager_id: Optional[int] = None
    shift_id: Optional[int] = None
    photo_url: Optional[str] = None


class EmployeeOut(EmployeeListItem):
    personal_email: Optional[str] = None
    phone: Optional[str] = None
    date_of_exit: Optional[date] = None
    profile: Optional[EmployeeProfileOut] = None
