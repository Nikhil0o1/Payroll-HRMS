"""Regularization endpoints."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    is_privileged,
    require_manager,
)
from app.core.pagination import PageParams, build_page
from app.models.enums import RegularizationStatus
from app.models.user import User
from app.schemas.common import Page
from app.schemas.regularization import (
    RegularizationCreate,
    RegularizationDecision,
    RegularizationOut,
    RegularizationRejection,
)
from app.services import regularization_service

router = APIRouter(prefix="/regularizations", tags=["regularizations"])


@router.post("", response_model=RegularizationOut, status_code=201)
def submit(
    payload: RegularizationCreate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.employee_id is None:
        raise HTTPException(status_code=400, detail="No employee linked to this account")
    req = regularization_service.submit(db, employee_id=current.employee_id, payload=payload, actor=current)
    return RegularizationOut.model_validate(req)


@router.get("", response_model=Page[RegularizationOut])
def list_requests(
    employee_id: Optional[int] = None,
    status: Optional[RegularizationStatus] = None,
    scope: Optional[str] = Query(None, regex="^(self|reports|all)$"),
    params: PageParams = Depends(),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    privileged = is_privileged(current)
    if scope == "self" or (scope is None and not privileged and current.role.name.value == "EMPLOYEE"):
        employee_id = current.employee_id
    rows, total = regularization_service.list_requests(
        db,
        params,
        employee_id=employee_id,
        status=status,
        manager_user=current,
        privileged=privileged,
    )
    return build_page(rows, total, params)


@router.post("/{request_id}/approve", response_model=RegularizationOut)
def approve(
    request_id: int,
    payload: RegularizationDecision,
    db: Session = Depends(get_db),
    current: User = Depends(require_manager),
):
    return RegularizationOut.model_validate(
        regularization_service.approve(db, request_id, payload, actor=current)
    )


@router.post("/{request_id}/reject", response_model=RegularizationOut)
def reject(
    request_id: int,
    payload: RegularizationRejection,
    db: Session = Depends(get_db),
    current: User = Depends(require_manager),
):
    return RegularizationOut.model_validate(
        regularization_service.reject(
            db,
            request_id,
            RegularizationDecision(decision_note=payload.decision_note),
            actor=current,
        )
    )
