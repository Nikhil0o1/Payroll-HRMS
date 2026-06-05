"""Salary structure endpoints."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    ensure_self_or_privileged,
    get_current_user,
    require_hr,
)
from app.models.user import User
from app.schemas.payroll import (
    SalaryStructureCreate,
    SalaryStructureOut,
    SalaryStructureUpdate,
)
from app.services import payroll_service

router = APIRouter(prefix="/salary-structures", tags=["salary"])


@router.get("/by-employee/{employee_id}", response_model=list[SalaryStructureOut])
def list_for_employee(
    employee_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)
):
    ensure_self_or_privileged(current, employee_id)
    return [SalaryStructureOut.model_validate(s) for s in payroll_service.list_structures(db, employee_id)]


@router.get("/active/{employee_id}", response_model=SalaryStructureOut)
def get_active(
    employee_id: int,
    on_date: date = Query(default_factory=date.today),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    ensure_self_or_privileged(current, employee_id)
    s = payroll_service.get_active_structure(db, employee_id, on_date)
    if not s:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("No active salary structure")
    return SalaryStructureOut.model_validate(s)


@router.post("", response_model=SalaryStructureOut, status_code=201)
def create(
    payload: SalaryStructureCreate, db: Session = Depends(get_db), current: User = Depends(require_hr)
):
    return SalaryStructureOut.model_validate(payroll_service.create_structure(db, payload, actor=current))


@router.patch("/{structure_id}", response_model=SalaryStructureOut)
def update(
    structure_id: int,
    payload: SalaryStructureUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    return SalaryStructureOut.model_validate(
        payroll_service.update_structure(db, structure_id, payload, actor=current)
    )
