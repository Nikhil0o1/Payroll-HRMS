"""Shared FastAPI dependencies: DB session, current user, RBAC guards."""
from __future__ import annotations

from typing import Iterable

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token, decode_step_up_token
from app.models.enums import ROLE_RANK, RoleName
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login")
step_up_scheme = APIKeyHeader(name="X-Step-Up-Token", auto_error=False)

_CRED_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    payload = decode_access_token(token)
    if not payload:
        raise _CRED_EXC
    user_id = payload.get("sub")
    if user_id is None:
        raise _CRED_EXC
    user = db.get(User, int(user_id))
    if user is None:
        raise _CRED_EXC
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    return user


def require_roles(*roles: RoleName):
    """Dependency factory: allow the given roles and any higher-ranked role.

    Roles are hierarchical (EMPLOYEE < MANAGER < HR_ADMIN < SUPER_ADMIN), so a
    gate at MANAGER also admits HR_ADMIN and SUPER_ADMIN.
    """
    min_rank = min((ROLE_RANK[r] for r in roles), default=0)

    def _guard(current_user: User = Depends(get_current_user)) -> User:
        if ROLE_RANK[current_user.role_name] >= min_rank:
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action",
        )

    return _guard


# Convenience guards
require_manager = require_roles(RoleName.MANAGER, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
require_hr = require_roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
require_super_admin = require_roles(RoleName.SUPER_ADMIN)


def require_step_up(*purposes: str):
    allowed = set(purposes)

    def _guard(
        token: str | None = Depends(step_up_scheme),
        current_user: User = Depends(get_current_user),
    ) -> User:
        payload = decode_step_up_token(token or "")
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Step-up authentication is required",
            )
        if str(current_user.id) != str(payload.get("sub")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Step-up token does not belong to the current user",
            )
        if allowed and payload.get("purpose") not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Step-up token is not valid for this action",
            )
        return current_user

    return _guard


def is_privileged(user: User) -> bool:
    """HR Admin or Super Admin — org-wide access."""
    return ROLE_RANK[user.role_name] >= ROLE_RANK[RoleName.HR_ADMIN]


def ensure_self_or_privileged(user: User, employee_id: int) -> None:
    """Allow access if the user owns the employee record or is privileged."""
    if is_privileged(user):
        return
    if user.employee_id == employee_id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You can only access your own records",
    )
