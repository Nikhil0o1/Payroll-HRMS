"""Schemas for the Settings area: organisation profile, work locations,
salary components, salary templates, pay schedule, and user listing."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import RoleName
from app.schemas.common import ORMModel


# ---------- Organisation profile ----------


class OrganizationProfileOut(ORMModel):
    id: int
    name: str
    legal_name: Optional[str] = None
    industry: Optional[str] = None
    business_location: str
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    date_format: str
    currency: str
    logo_key: Optional[str] = None


class OrganizationProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    legal_name: Optional[str] = Field(default=None, max_length=200)
    industry: Optional[str] = Field(default=None, max_length=100)
    business_location: Optional[str] = Field(default=None, max_length=100)
    address_line1: Optional[str] = Field(default=None, max_length=200)
    address_line2: Optional[str] = Field(default=None, max_length=200)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    pincode: Optional[str] = Field(default=None, max_length=12)
    date_format: Optional[str] = Field(default=None, max_length=20)
    currency: Optional[str] = Field(default=None, max_length=8)


# ---------- Work locations ----------


class WorkLocationBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    address_line1: Optional[str] = Field(default=None, max_length=200)
    address_line2: Optional[str] = Field(default=None, max_length=200)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    pincode: Optional[str] = Field(default=None, max_length=12)
    country: str = Field(default="India", max_length=100)
    is_primary: bool = False


class WorkLocationCreate(WorkLocationBase):
    pass


class WorkLocationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    is_primary: Optional[bool] = None


class WorkLocationOut(ORMModel):
    id: int
    name: str
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: str
    is_primary: bool


# ---------- Salary components ----------

ComponentCategory = str  # Literal["EARNING","DEDUCTION","REIMBURSEMENT"] enforced in validator
ComponentCalcType = str  # Literal["FIXED","PERCENT_OF_BASIC","PERCENT_OF_CTC"]


class SalaryComponentBase(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    category: str = Field(default="EARNING")
    calc_type: str = Field(default="FIXED")
    calc_value: float = Field(default=0, ge=0)
    consider_for_epf: bool = False
    consider_for_esi: bool = False
    is_active: bool = True

    @field_validator("category")
    @classmethod
    def _category(cls, v: str) -> str:
        v = (v or "").upper()
        if v not in {"EARNING", "DEDUCTION", "REIMBURSEMENT"}:
            raise ValueError("category must be EARNING, DEDUCTION, or REIMBURSEMENT")
        return v

    @field_validator("calc_type")
    @classmethod
    def _calc_type(cls, v: str) -> str:
        v = (v or "").upper()
        if v not in {"FIXED", "PERCENT_OF_BASIC", "PERCENT_OF_CTC"}:
            raise ValueError("calc_type must be FIXED, PERCENT_OF_BASIC, or PERCENT_OF_CTC")
        return v

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        v = (v or "").strip().upper().replace(" ", "_")
        if not v.replace("_", "").isalnum():
            raise ValueError("code may only contain letters, digits and underscores")
        return v


class SalaryComponentCreate(SalaryComponentBase):
    pass


class SalaryComponentUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    calc_type: Optional[str] = None
    calc_value: Optional[float] = Field(default=None, ge=0)
    consider_for_epf: Optional[bool] = None
    consider_for_esi: Optional[bool] = None
    is_active: Optional[bool] = None


class SalaryComponentOut(ORMModel):
    id: int
    code: str
    name: str
    category: str
    calc_type: str
    calc_value: float
    consider_for_epf: bool
    consider_for_esi: bool
    is_active: bool


# ---------- Salary templates ----------


class SalaryTemplateComponent(BaseModel):
    code: str
    name: str
    calc_type: str
    value: float = 0


class SalaryTemplateBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = None
    annual_ctc: Optional[float] = Field(default=None, ge=0)
    components: List[SalaryTemplateComponent] = Field(default_factory=list)
    is_active: bool = True


class SalaryTemplateCreate(SalaryTemplateBase):
    pass


class SalaryTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    annual_ctc: Optional[float] = None
    components: Optional[List[SalaryTemplateComponent]] = None
    is_active: Optional[bool] = None


class SalaryTemplateOut(ORMModel):
    id: int
    name: str
    description: Optional[str] = None
    annual_ctc: Optional[float] = None
    components: List[SalaryTemplateComponent] = Field(default_factory=list)
    is_active: bool


# ---------- Pay schedule ----------


class PayScheduleOut(BaseModel):
    work_week: List[int]  # 0=Sun, 6=Sat (matches Mon-first label rendering on FE)
    salary_calc_basis: str  # "actual" | "org_days"
    org_working_days: Optional[int] = None
    pay_day_type: str  # "last_working_day" | "fixed_day"
    pay_day: Optional[int] = None
    first_payroll_month: Optional[str] = None  # "YYYY-MM"


class PayScheduleUpdate(BaseModel):
    work_week: Optional[List[int]] = None
    salary_calc_basis: Optional[str] = None
    org_working_days: Optional[int] = Field(default=None, ge=20, le=31)
    pay_day_type: Optional[str] = None
    pay_day: Optional[int] = Field(default=None, ge=1, le=31)
    first_payroll_month: Optional[str] = None

    @field_validator("salary_calc_basis")
    @classmethod
    def _basis(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.lower()
        if v not in {"actual", "org_days"}:
            raise ValueError("salary_calc_basis must be 'actual' or 'org_days'")
        return v

    @field_validator("pay_day_type")
    @classmethod
    def _pdt(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.lower()
        if v not in {"last_working_day", "fixed_day"}:
            raise ValueError("pay_day_type must be 'last_working_day' or 'fixed_day'")
        return v


# ---------- Users & Roles ----------


class UserListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    role: RoleName
    is_active: bool
    last_login_at: Optional[str] = None
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None


class InviteUserRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    role: RoleName = RoleName.EMPLOYEE
    employee_id: Optional[int] = None


class InviteUserResponse(BaseModel):
    id: int
    email: str
    role: RoleName
    initial_password: str  # one-time only — admin shares via secure channel


class RoleOut(ORMModel):
    id: int
    name: RoleName
    description: Optional[str] = None
