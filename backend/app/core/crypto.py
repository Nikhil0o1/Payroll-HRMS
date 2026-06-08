"""Encryption and masking helpers for sensitive payroll data."""
from __future__ import annotations

import base64
import hashlib
from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

BANK_ACCOUNT_PREFIX = "enc:v1:"


@lru_cache(maxsize=1)
def _bank_account_fernet() -> Fernet:
    key = settings.BANK_ACCOUNT_ENCRYPTION_KEY
    if key:
        return Fernet(key.encode("utf-8"))
    derived = base64.urlsafe_b64encode(
        hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    )
    return Fernet(derived)


def is_encrypted_bank_account(value: Optional[str]) -> bool:
    return bool(value and value.startswith(BANK_ACCOUNT_PREFIX))


def encrypt_bank_account(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if is_encrypted_bank_account(raw):
        return raw
    token = _bank_account_fernet().encrypt(raw.encode("utf-8")).decode("ascii")
    return f"{BANK_ACCOUNT_PREFIX}{token}"


def decrypt_bank_account(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if not is_encrypted_bank_account(raw):
        # Legacy plaintext support for rows that have not been migrated yet.
        return raw
    token = raw[len(BANK_ACCOUNT_PREFIX) :].encode("ascii")
    try:
        return _bank_account_fernet().decrypt(token).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Bank account number could not be decrypted") from exc


def bank_account_last4(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    tail = digits[-4:] if digits else str(value)[-4:]
    return tail or None


def mask_bank_account(value: Optional[str]) -> Optional[str]:
    tail = bank_account_last4(value)
    if not tail:
        return None
    return f"**** **** **** {tail}"
