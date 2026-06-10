"""Employee & EmployeeProfile models."""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import JSON, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.crypto import (
    bank_account_last4,
    decrypt_bank_account,
    encrypt_bank_account,
    mask_bank_account,
)
from app.core.database import Base
from app.models.enums import BankDetailChangeStatus, EmployeeStatus, EmploymentType
from app.models.types import enum_column


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    work_email: Mapped[str] = mapped_column(String(255), index=True)
    personal_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    date_of_joining: Mapped[date] = mapped_column(Date)
    date_of_exit: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    department: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    designation: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Profile photo, stored inline as a base64 data URL (mirrors the org logo)
    # so it can be rendered directly via <img src> without a static-asset host.
    photo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    manager_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("employees.id"), nullable=True, index=True
    )
    # Assigned working shift (drives attendance calculation). Nullable so the
    # resolver can fall back to the org default shift / global policy.
    shift_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("shifts.id"), nullable=True, index=True
    )
    employment_type: Mapped[EmploymentType] = mapped_column(
        enum_column(EmploymentType), default=EmploymentType.FULL_TIME
    )
    status: Mapped[EmployeeStatus] = mapped_column(
        enum_column(EmployeeStatus), default=EmployeeStatus.ACTIVE, index=True
    )

    # Relationships
    manager = relationship("Employee", remote_side=[id], backref="reports")
    shift = relationship("Shift")
    user = relationship("User", back_populates="employee", uselist=False)
    profile: Mapped[Optional["EmployeeProfile"]] = relationship(
        back_populates="employee", uselist=False, cascade="all, delete-orphan"
    )
    salary_structures = relationship(
        "SalaryStructure", back_populates="employee", cascade="all, delete-orphan"
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class EmployeeProfile(Base):
    __tablename__ = "employee_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id"), unique=True, index=True
    )

    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Official DOB as printed on the birth/10th certificate — often differs from
    # the personal/actual DOB in India, and is the one used for statutory records.
    certificate_date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    bank_account_no_encrypted: Mapped[Optional[str]] = mapped_column(
        "bank_account_no", String(512), nullable=True
    )
    bank_ifsc: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    bank_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bank_branch: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    bank_account_holder_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    bank_account_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # SAVINGS | CURRENT | SALARY
    pan: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # [{name, relationship, phone}]
    emergency_contacts: Mapped[Optional[list]] = mapped_column(JSON, default=list, nullable=True)

    employee: Mapped["Employee"] = relationship(back_populates="profile")

    @property
    def bank_account_no_plain(self) -> Optional[str]:
        return decrypt_bank_account(self.bank_account_no_encrypted)

    @property
    def bank_account_no(self) -> Optional[str]:
        return mask_bank_account(self.bank_account_no_plain)

    @bank_account_no.setter
    def bank_account_no(self, value: Optional[str]) -> None:
        self.set_bank_account_no(value)

    @property
    def bank_account_last4(self) -> Optional[str]:
        return bank_account_last4(self.bank_account_no_plain)

    def set_bank_account_no(self, value: Optional[str]) -> None:
        self.bank_account_no_encrypted = encrypt_bank_account(value)


class EmployeeBankDetailChangeRequest(Base):
    __tablename__ = "employee_bank_detail_change_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    requested_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    reviewed_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    status: Mapped[BankDetailChangeStatus] = mapped_column(
        enum_column(BankDetailChangeStatus),
        default=BankDetailChangeStatus.PENDING,
        index=True,
        nullable=False,
    )
    changes: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    requested_bank_account_no_encrypted: Mapped[Optional[str]] = mapped_column(
        "requested_bank_account_no", String(512), nullable=True
    )
    requested_bank_ifsc: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    requested_bank_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    decision_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    employee = relationship("Employee")

    @property
    def requested_bank_account_no_plain(self) -> Optional[str]:
        return decrypt_bank_account(self.requested_bank_account_no_encrypted)

    @property
    def bank_account_no(self) -> Optional[str]:
        return mask_bank_account(self.requested_bank_account_no_plain)

    @property
    def bank_account_last4(self) -> Optional[str]:
        return bank_account_last4(self.requested_bank_account_no_plain)

    def set_requested_bank_account_no(self, value: Optional[str]) -> None:
        self.requested_bank_account_no_encrypted = encrypt_bank_account(value)

    @property
    def bank_ifsc(self) -> Optional[str]:
        return self.requested_bank_ifsc

    @property
    def bank_name(self) -> Optional[str]:
        return self.requested_bank_name

    @property
    def employee_name(self) -> Optional[str]:
        return self.employee.full_name if self.employee else None

    @property
    def employee_code(self) -> Optional[str]:
        return self.employee.employee_code if self.employee else None
