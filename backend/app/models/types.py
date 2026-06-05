"""Reusable column types/helpers shared by models."""
from __future__ import annotations

from sqlalchemy import Enum as SAEnum


def enum_column(enum_cls):
    """Portable enum column: stores the enum *value* as VARCHAR with a CHECK
    constraint. Works identically on SQLite (dev) and PostgreSQL (prod) and
    avoids native-enum ALTER pain during migrations.
    """
    return SAEnum(
        enum_cls,
        native_enum=False,
        values_callable=lambda e: [member.value for member in e],
        validate_strings=True,
        length=32,
    )
