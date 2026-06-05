"""Employee & EmployeeProfile models."""
from __future__ import annotations

from datetime import date
from typing import List, Optional

from sqlalchemy import JSON, Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import EmployeeStatus, EmploymentType
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

    manager_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("employees.id"), nullable=True, index=True
    )
    employment_type: Mapped[EmploymentType] = mapped_column(
        enum_column(EmploymentType), default=EmploymentType.FULL_TIME
    )
    status: Mapped[EmployeeStatus] = mapped_column(
        enum_column(EmployeeStatus), default=EmployeeStatus.ACTIVE, index=True
    )

    # Relationships
    manager = relationship("Employee", remote_side=[id], backref="reports")
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
    gender: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    bank_account_no: Mapped[Optional[str]] = mapped_column(String(34), nullable=True)
    bank_ifsc: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    bank_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    pan: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # [{name, relationship, phone}]
    emergency_contacts: Mapped[Optional[list]] = mapped_column(JSON, default=list, nullable=True)
    photo_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    employee: Mapped["Employee"] = relationship(back_populates="profile")
