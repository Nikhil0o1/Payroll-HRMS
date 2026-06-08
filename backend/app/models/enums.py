"""Shared enumerations used across models and schemas."""
from __future__ import annotations

import enum


class RoleName(str, enum.Enum):
    EMPLOYEE = "EMPLOYEE"
    MANAGER = "MANAGER"
    HR_ADMIN = "HR_ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


# Privilege ordering for hierarchical convenience checks.
ROLE_RANK = {
    RoleName.EMPLOYEE: 1,
    RoleName.MANAGER: 2,
    RoleName.HR_ADMIN: 3,
    RoleName.SUPER_ADMIN: 4,
}


class EmploymentType(str, enum.Enum):
    FULL_TIME = "FULL_TIME"
    PART_TIME = "PART_TIME"
    CONTRACT = "CONTRACT"
    INTERN = "INTERN"


class EmployeeStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class PunchType(str, enum.Enum):
    IN = "IN"
    OUT = "OUT"


class PunchSource(str, enum.Enum):
    WEB = "WEB"
    BIOMETRIC = "BIOMETRIC"
    IMPORT = "IMPORT"
    REGULARIZATION = "REGULARIZATION"


class AttendanceStatus(str, enum.Enum):
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"
    HALF_DAY = "HALF_DAY"
    ON_LEAVE = "ON_LEAVE"
    HOLIDAY = "HOLIDAY"
    WEEKEND = "WEEKEND"


class LeaveStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class RegularizationType(str, enum.Enum):
    MISSING_IN = "MISSING_IN"
    MISSING_OUT = "MISSING_OUT"
    WRONG_TIME = "WRONG_TIME"
    OTHER = "OTHER"


class RegularizationStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class HolidayType(str, enum.Enum):
    PUBLIC = "PUBLIC"
    OPTIONAL = "OPTIONAL"


class ComponentType(str, enum.Enum):
    EARNING = "EARNING"
    DEDUCTION = "DEDUCTION"


class CalcType(str, enum.Enum):
    FIXED = "FIXED"
    PERCENT_OF_BASIC = "PERCENT_OF_BASIC"
    PERCENT_OF_CTC = "PERCENT_OF_CTC"


class PayrollStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    REVIEW = "REVIEW"
    APPROVED = "APPROVED"
    LOCKED = "LOCKED"


class BankDetailChangeStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
