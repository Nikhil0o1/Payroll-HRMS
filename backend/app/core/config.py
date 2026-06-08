"""Application configuration loaded from environment / .env file."""
from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("hrms")

_INSECURE_SECRETS = {"CHANGE_ME", "CHANGE_ME_super_secret_dev_key_only", ""}

# Repo root holds the canonical `.env` (one location regardless of which
# directory you launch uvicorn from). This file lives at:
#   <root>/backend/app/core/config.py  →  parents[3] = <root>
PROJECT_ROOT: Path = Path(__file__).resolve().parents[3]
ENV_FILE: Path = PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE), env_file_encoding="utf-8", extra="ignore"
    )

    # App
    APP_NAME: str = "HRMS Payroll"
    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/api/v1"
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    LOG_LEVEL: Optional[str] = None  # default: DEBUG in dev, INFO in prod
    DEFAULT_CURRENCY: str = "INR"

    # Database
    DATABASE_URL: str = "sqlite:///./hrms.db"

    # Security
    SECRET_KEY: str = "CHANGE_ME"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    STEP_UP_TOKEN_EXPIRE_MINUTES: int = 5
    BANK_ACCOUNT_ENCRYPTION_KEY: Optional[str] = None
    ALGORITHM: str = "HS256"

    # Brute-force protection.
    # NOTE: the per-IP throttle is a coarse flood guard only. Because an entire
    # office can sit behind one NAT IP, it is intentionally generous — the real
    # protection against targeted attacks is the per-ACCOUNT lockout below.
    RATE_LIMIT_ENABLED: bool = True
    LOGIN_RATE_LIMIT_ATTEMPTS: int = 50       # per IP, per window
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 60
    ACCOUNT_LOCKOUT_THRESHOLD: int = 8        # failed logins (per account) before temp lock (0 = disabled)
    ACCOUNT_LOCKOUT_MINUTES: int = 15

    # Company domain allow-list. Empty = no restriction (dev/demo). When set,
    # every email-introducing entry point — signup, login, admin-invite,
    # admin-create-employee — is restricted to addresses ending in one of
    # these domains. Stored as a raw string for friendly env input — read the
    # parsed list via :pyattr:`allowed_email_domains`. Accepts comma-separated
    # values or a JSON array; a leading ``@`` is allowed (it's stripped).
    # Examples:
    #   ALLOWED_EMAIL_DOMAINS=yanthraa.com
    #   ALLOWED_EMAIL_DOMAINS=yanthraa.com, yanthraa.in
    #   ALLOWED_EMAIL_DOMAINS=["yanthraa.com","yanthraa.in"]
    ALLOWED_EMAIL_DOMAINS: str = ""

    # Storage
    STORAGE_BACKEND: str = "local"
    STORAGE_DIR: str = "./storage"
    S3_BUCKET: str = ""
    S3_REGION: str = ""
    S3_ENDPOINT_URL: str = ""
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""

    # Email
    # `console` (default) logs emails to stdout so dev works out of the box.
    # `smtp` actually delivers via SMTP_HOST/PORT/USERNAME/PASSWORD.
    EMAIL_BACKEND: str = "console"  # console | smtp
    EMAIL_FROM_ADDRESS: str = "no-reply@company.com"
    EMAIL_FROM_NAME: str = "HRMS Payroll"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False  # true for port 465 (legacy); false for STARTTLS on 587

    # Public URL of the frontend, used in transactional email links.
    APP_PUBLIC_URL: str = "http://localhost:5173"

    # Payroll segregation of duties: when true, a payroll run must be approved
    # by a different user than the one who created it (maker-checker). Small
    # single-admin teams can set this false.
    PAYROLL_REQUIRE_SEPARATE_APPROVER: bool = True

    # Payroll / attendance policy
    # Business timezone — attendance is a local-time concept (punch times shown
    # to users, workday-start lateness, which calendar day a punch belongs to).
    # Timestamps are stored as UTC and presented in this zone.
    APP_TIMEZONE: str = "Asia/Kolkata"
    WORKDAY_START: str = "09:30"  # local (APP_TIMEZONE) wall-clock
    FULL_DAY_MINUTES: int = 480
    HALF_DAY_MINUTES: int = 240
    WEEKEND_DAYS: List[int] = [5, 6]  # Mon=0 ... Sun=6

    # Seed / bootstrap
    FIRST_SUPERADMIN_EMAIL: str = "admin@company.com"
    FIRST_SUPERADMIN_PASSWORD: str = "Admin@12345"
    # When true, app startup auto-bootstraps roles, leave types, holidays and
    # the admin user (idempotent). Set to false in multi-replica deployments
    # if you prefer to run `python -m app.seed` from a dedicated init job.
    AUTO_BOOTSTRAP_ON_STARTUP: bool = True

    @field_validator("BACKEND_CORS_ORIGINS", "WEEKEND_DAYS", mode="before")
    @classmethod
    def _split_list(cls, v):
        # Allow comma-separated env values in addition to JSON arrays.
        if isinstance(v, str) and not v.strip().startswith("["):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v

    @model_validator(mode="after")
    def _enforce_production_safety(self) -> "Settings":
        """Fail fast on insecure configuration in production; warn in dev."""
        problems: list[str] = []

        if self.SECRET_KEY in _INSECURE_SECRETS or len(self.SECRET_KEY) < 32:
            problems.append(
                "SECRET_KEY must be set to a strong random value of >= 32 chars "
                '(generate: python -c "import secrets; print(secrets.token_urlsafe(48))")'
            )
        if self.is_production and not self.BANK_ACCOUNT_ENCRYPTION_KEY:
            problems.append(
                "BANK_ACCOUNT_ENCRYPTION_KEY must be set in production "
                '(generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")'
            )
        if "*" in self.BACKEND_CORS_ORIGINS:
            problems.append("BACKEND_CORS_ORIGINS must not contain '*' in production")
        if self.is_sqlite:
            problems.append("DATABASE_URL must point to PostgreSQL in production, not SQLite")
        if self.STORAGE_BACKEND == "s3" and not self.S3_BUCKET:
            problems.append("S3_BUCKET is required when STORAGE_BACKEND=s3")
        if self.FIRST_SUPERADMIN_PASSWORD in {"", "Admin@12345"}:
            problems.append(
                "FIRST_SUPERADMIN_PASSWORD must be changed from its default and kept secret"
            )

        if problems:
            if self.is_production:
                raise ValueError(
                    "Insecure production configuration:\n  - " + "\n  - ".join(problems)
                )
            for p in problems:
                logger.warning("[config] %s (allowed in development only)", p)
        return self

    @property
    def allowed_email_domains(self) -> list[str]:
        """Parsed view of :pyattr:`ALLOWED_EMAIL_DOMAINS`. Empty list when
        no policy is configured. Tolerates JSON arrays, comma-separated
        strings, leading ``@`` and mixed whitespace/case."""
        import json

        raw = (self.ALLOWED_EMAIL_DOMAINS or "").strip()
        if not raw:
            return []
        items: list[str]
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
                items = [str(x) for x in parsed] if isinstance(parsed, list) else []
            except json.JSONDecodeError:
                items = []
        else:
            items = [s.strip() for s in raw.split(",") if s.strip()]
        out: list[str] = []
        seen: set[str] = set()
        for s in items:
            d = s.strip().lower().lstrip("@")
            if d and d not in seen:
                out.append(d)
                seen.add(d)
        return out

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in {"production", "prod"}

    @property
    def effective_log_level(self) -> str:
        return self.LOG_LEVEL or ("INFO" if self.is_production else "DEBUG")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
