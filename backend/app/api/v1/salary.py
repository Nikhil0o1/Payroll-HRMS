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
    CreateStructureFromTypeRequest,
    SalaryPreviewOut,
    SalaryPreviewRequest,
    SalaryStructureCreate,
    SalaryStructureOut,
    SalaryStructureUpdate,
)
from app.services import payroll_service

router = APIRouter(prefix="/salary-structures", tags=["salary"])


@router.post("/preview", response_model=SalaryPreviewOut)
def preview(
    payload: SalaryPreviewRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    """Compute the monthly salary breakdown for an employment type + Annual CTC
    using that type's component set. Used by the onboarding wizard."""
    return payroll_service.preview_salary(db, payload.employment_type, payload.ctc_annual)


@router.post("/from-type", response_model=SalaryStructureOut, status_code=201)
def create_from_type(
    payload: CreateStructureFromTypeRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    """Build + persist an employee's salary structure from their employment
    type's components and Annual CTC."""
    s = payroll_service.create_structure_for_type(
        db,
        employee_id=payload.employee_id,
        employment_type=payload.employment_type,
        ctc_annual=payload.ctc_annual,
        effective_from=payload.effective_from or date.today(),
        actor=current,
    )
    return SalaryStructureOut.model_validate(s)


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
