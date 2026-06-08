"""FastAPI application factory and entry point."""
from __future__ import annotations

import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import setup_logging

setup_logging(settings.effective_log_level)
logger = logging.getLogger("hrms")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=__version__,
        description=(
            "HRMS + Payroll API — focused, production-grade platform "
            "for attendance, leave, regularization, payroll and payslips."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Step-Up-Token"],
        expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        start = time.perf_counter()
        request.state.request_id = request_id
        try:
            response = await call_next(request)
        except Exception:  # pragma: no cover — handled by global exception handlers
            logger.exception("Request crashed: %s %s", request.method, request.url.path)
            raise
        duration_ms = (time.perf_counter() - start) * 1000
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "%s %s -> %s (%.1f ms) [%s]",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request_id,
        )
        return response

    register_exception_handlers(app)

    app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)

    @app.get("/", tags=["meta"])
    def root() -> dict:
        return {
            "name": settings.APP_NAME,
            "version": __version__,
            "environment": settings.ENVIRONMENT,
            "docs": "/docs",
            "api": settings.API_V1_PREFIX,
        }

    @app.get("/health", tags=["meta"])
    def health() -> dict:
        return {"status": "ok"}

    @app.on_event("startup")
    def _startup() -> None:
        logger.info(
            "Starting %s v%s [%s] — DB=%s",
            settings.APP_NAME,
            __version__,
            settings.ENVIRONMENT,
            "sqlite" if settings.is_sqlite else "postgres",
        )
        # In dev (SQLite) auto-create tables for zero-setup. In prod we
        # rely exclusively on Alembic migrations.
        if settings.is_sqlite:
            from app.core.database import Base, engine
            from app import models  # noqa: F401  ensures model registration

            Base.metadata.create_all(bind=engine)

        # Idempotent bootstrap: roles, default leave types, and the single
        # admin from .env. Default leave types are only seeded into an empty
        # table — once the admin has configured anything, we never re-add.
        if settings.AUTO_BOOTSTRAP_ON_STARTUP:
            from app.core.database import SessionLocal
            from app.seed import (
                ensure_default_leave_types,
                ensure_roles,
                ensure_super_admin,
            )

            db = SessionLocal()
            try:
                roles = ensure_roles(db)
                ensure_super_admin(db, roles)
                seeded = ensure_default_leave_types(db)
                db.commit()
                if seeded:
                    logger.info(
                        "Bootstrap ready (roles + admin + default leave types: %s)",
                        ", ".join(s.code for s in seeded),
                    )
                else:
                    logger.info("Bootstrap ready (roles + admin user seeded)")
            except Exception:
                db.rollback()
                logger.exception("Bootstrap on startup failed")
                raise
            finally:
                db.close()

    return app


app = create_app()
