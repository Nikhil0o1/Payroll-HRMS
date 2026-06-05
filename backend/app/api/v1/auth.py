"""Authentication endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.ratelimit import rate_limit
from app.models.user import User
from app.schemas.auth import (
    AccessOnly,
    ChangePasswordRequest,
    LoginRequest,
    MeResponse,
    RefreshRequest,
    SignupRequest,
    TokenPair,
)
from app.schemas.common import Message
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

# Brute-force throttles (per client IP).
_login_limiter = rate_limit(
    settings.LOGIN_RATE_LIMIT_ATTEMPTS, settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS, "login"
)
_signup_limiter = rate_limit(5, 60, "signup")
_refresh_limiter = rate_limit(30, 60, "refresh")


def _expires_in() -> int:
    return settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


@router.post("/signup", response_model=TokenPair, status_code=201, dependencies=[Depends(_signup_limiter)])
def signup(payload: SignupRequest, request: Request, db: Session = Depends(get_db)) -> TokenPair:
    """Public self-serve signup. Always creates an EMPLOYEE-role account."""
    user, access, refresh = auth_service.signup_employee(
        db,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        password=payload.password,
        phone=payload.phone,
        department=payload.department,
        designation=payload.designation,
        date_of_joining=payload.date_of_joining,
        ip=request.client.host if request.client else None,
    )
    return TokenPair(access_token=access, refresh_token=refresh, expires_in=_expires_in())


@router.post("/login", response_model=TokenPair, dependencies=[Depends(_login_limiter)])
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenPair:
    user, access, refresh = auth_service.authenticate(
        db, payload.email, payload.password, ip=request.client.host if request.client else None
    )
    return TokenPair(access_token=access, refresh_token=refresh, expires_in=_expires_in())


@router.post("/refresh", response_model=TokenPair, dependencies=[Depends(_refresh_limiter)])
def refresh(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)) -> TokenPair:
    user, access, new_refresh = auth_service.rotate_refresh(
        db, payload.refresh_token, ip=request.client.host if request.client else None
    )
    return TokenPair(access_token=access, refresh_token=new_refresh, expires_in=_expires_in())


@router.post("/logout", response_model=Message)
def logout(
    payload: RefreshRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Message:
    auth_service.logout(
        db, payload.refresh_token, user, ip=request.client.host if request.client else None
    )
    return Message(message="Logged out")


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(
        id=user.id,
        email=user.email,
        role=user.role.name,
        is_active=user.is_active,
        last_login_at=user.last_login_at,
        employee=user.employee,  # may be None
    )


@router.post("/change-password", response_model=Message)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Message:
    auth_service.change_password(
        db,
        user,
        payload.current_password,
        payload.new_password,
        ip=request.client.host if request.client else None,
    )
    return Message(message="Password updated. Please log in again.")
