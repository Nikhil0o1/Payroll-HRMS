"""Birthday-wish log: a record that an employee was wished for a given year."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class BirthdayWish(Base):
    """One row per employee per calendar year a birthday wish was sent.

    The ``(employee_id, year)`` uniqueness makes sending idempotent — an
    employee is never wished twice for the same birthday, so the "Send wishes"
    button can be clicked safely and the UI can show a "Wished ✓" state.
    ``created_at`` (from ``Base``) is the sent timestamp.
    """

    __tablename__ = "birthday_wishes"
    __table_args__ = (
        UniqueConstraint("employee_id", "year", name="uq_birthday_wish_employee_year"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    year: Mapped[int] = mapped_column(Integer, index=True)
    channel: Mapped[str] = mapped_column(String(16), default="email")
    sent_to: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    delivered: Mapped[bool] = mapped_column(default=True)
    sent_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
