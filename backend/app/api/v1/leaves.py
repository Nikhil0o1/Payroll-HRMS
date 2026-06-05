"""Leave endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.time import utcnow_naive
from app.core.deps import (
    ensure_self_or_privileged,
    get_current_user,
    is_privileged,
    require_hr,
    require_manager,
)
from app.core.pagination import PageParams, build_page
from app.models.enums import LeaveStatus
from app.models.user import User
from app.schemas.common import Page
from app.schemas.leave import (
    LeaveBalanceOut,
    LeaveDecision,
    LeaveRejection,
    LeaveRequestCreate,
    LeaveRequestOut,
    LeaveTypeCreate,
    LeaveTypeOut,
    LeaveTypeUpdate,
)
from app.services import leave_service

router = APIRouter(prefix="/leaves", tags=["leaves"])


# ---- Types ----
@router.get("/types", response_model=list[LeaveTypeOut])
def list_types(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    return [LeaveTypeOut.model_validate(t) for t in leave_service.list_types(db)]


@router.post("/types", response_model=LeaveTypeOut, status_code=201)
def create_type(
    payload: LeaveTypeCreate, db: Session = Depends(get_db), current: User = Depends(require_hr)
):
    lt = leave_service.create_type(db, payload, actor=current)
    return LeaveTypeOut.model_validate(lt)


@router.patch("/types/{type_id}", response_model=LeaveTypeOut)
def update_type(
    type_id: int,
    payload: LeaveTypeUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    lt = leave_service.update_type(db, type_id, payload, actor=current)
    return LeaveTypeOut.model_validate(lt)


@router.delete("/types/{type_id}", status_code=204)
def delete_type(
    type_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    leave_service.delete_type(db, type_id, actor=current)
    return None


# ---- Balances ----
@router.get("/balances", response_model=list[LeaveBalanceOut])
def my_balances(
    year: Optional[int] = None,
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    emp_id = employee_id or current.employee_id
    if emp_id is None:
        raise HTTPException(status_code=400, detail="No employee linked to this account")
    ensure_self_or_privileged(current, emp_id)
    year = year or utcnow_naive().year
    rows = leave_service.get_balances(db, emp_id, year)
    return [
        LeaveBalanceOut.model_validate(
            {
                "id": r.id,
                "employee_id": r.employee_id,
                "leave_type_id": r.leave_type_id,
                "year": r.year,
                "allotted": float(r.allotted),
                "used": float(r.used),
                "pending": float(r.pending),
                "available": float(r.available),
                "leave_type": r.leave_type,
            }
        )
        for r in rows
    ]


# ---- Requests ----
@router.get("/requests", response_model=Page[LeaveRequestOut])
def list_requests(
    employee_id: Optional[int] = None,
    status: Optional[LeaveStatus] = None,
    scope: Optional[str] = Query(None, regex="^(self|reports|all)$"),
    params: PageParams = Depends(),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    privileged = is_privileged(current)
    if scope == "self" or (scope is None and not privileged and current.role.name.value == "EMPLOYEE"):
        employee_id = current.employee_id
    rows, total = leave_service.list_requests(
        db,
        params,
        employee_id=employee_id,
        status=status,
        manager_user=current,
        privileged=privileged,
    )
    return build_page(rows, total, params)


@router.post("/requests", response_model=LeaveRequestOut, status_code=201)
def apply_leave(
    payload: LeaveRequestCreate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.employee_id is None:
        raise HTTPException(status_code=400, detail="No employee linked to this account")
    req = leave_service.apply_leave(db, employee_id=current.employee_id, payload=payload, actor=current)
    return LeaveRequestOut.model_validate(req)


@router.post("/requests/{request_id}/cancel", response_model=LeaveRequestOut)
def cancel(request_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    req = leave_service.cancel_leave(db, request_id=request_id, actor=current)
    if not is_privileged(current) and req.employee_id != current.employee_id:
        raise HTTPException(status_code=403, detail="Cannot cancel another employee's leave")
    return LeaveRequestOut.model_validate(req)


@router.post("/requests/{request_id}/approve", response_model=LeaveRequestOut)
def approve(
    request_id: int,
    payload: LeaveDecision,
    db: Session = Depends(get_db),
    current: User = Depends(require_manager),
):
    req = leave_service.approve_leave(db, request_id, payload, actor=current)
    return LeaveRequestOut.model_validate(req)


@router.post("/requests/{request_id}/reject", response_model=LeaveRequestOut)
def reject(
    request_id: int,
    payload: LeaveRejection,
    db: Session = Depends(get_db),
    current: User = Depends(require_manager),
):
    req = leave_service.reject_leave(
        db, request_id, LeaveDecision(decision_note=payload.decision_note), actor=current
    )
    return LeaveRequestOut.model_validate(req)
