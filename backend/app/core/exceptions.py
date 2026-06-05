"""Domain exceptions and consistent error-envelope handlers."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("hrms")


class DomainError(Exception):
    """Business-rule violation -> HTTP 422 by default."""

    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code


class NotFoundError(DomainError):
    status_code = status.HTTP_404_NOT_FOUND


class ConflictError(DomainError):
    status_code = status.HTTP_409_CONFLICT


class PermissionError_(DomainError):
    status_code = status.HTTP_403_FORBIDDEN


def _envelope(code: int, message: str, details=None) -> JSONResponse:
    return JSONResponse(
        status_code=code,
        content={"error": {"code": code, "message": message, "details": details}},
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(_: Request, exc: DomainError):
        return _envelope(exc.status_code, exc.message)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        return _envelope(exc.status_code, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        # Pydantic v2 puts the raw exception in `ctx`, which isn't JSON
        # serializable — project each error down to safe primitives.
        details = [
            {"loc": [str(p) for p in e.get("loc", [])], "msg": e.get("msg"), "type": e.get("type")}
            for e in exc.errors()
        ]
        return _envelope(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Validation failed", details
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        logger.exception("Unhandled error: %s", exc)
        return _envelope(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Internal server error"
        )
