"""Auth-related schemas."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import validate_password_strength
from app.models.enums import RoleName
from app.schemas.common import ORMModel


def _strong_password(v: str) -> str:
    return validate_password_strength(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class SignupRequest(BaseModel):
    """Public self-serve signup. Always provisions an EMPLOYEE-role account."""

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone: Optional[str] = Field(default=None, max_length=32)
    department: Optional[str] = Field(default=None, max_length=120)
    designation: Optional[str] = Field(default=None, max_length=120)
    date_of_joining: Optional[date] = None  # defaults to today on the server

    _validate_password = field_validator("password")(_strong_password)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds for the access token


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessOnly(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)

    _validate_password = field_validator("new_password")(_strong_password)


class MeEmployee(ORMModel):
    id: int
    employee_code: str
    first_name: str
    last_name: str
    work_email: str
    department: Optional[str] = None
    designation: Optional[str] = None


class MeResponse(ORMModel):
    id: int
    email: EmailStr
    role: RoleName
    is_active: bool
    last_login_at: Optional[datetime] = None
    employee: Optional[MeEmployee] = None
