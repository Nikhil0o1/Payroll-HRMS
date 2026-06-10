"""Employee onboarding documents (KYC / certificates), stored via the storage
abstraction (local disk or S3) and downloaded through an authenticated endpoint."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EmployeeDocument(Base):
    __tablename__ = "employee_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    # AADHAAR | PAN | MARKSHEET_10 | MARKSHEET_12 | DEGREE | EXPERIENCE_LETTER
    # | PREVIOUS_PAYSLIP | OTHER
    doc_type: Mapped[str] = mapped_column(String(40), index=True)
    label: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    file_key: Mapped[str] = mapped_column(String(255))
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)

    uploaded_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )

    employee = relationship("Employee")
    # created_at / updated_at inherited from Base.
