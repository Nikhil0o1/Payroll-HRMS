"""Payroll run + payslip endpoints."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    ensure_self_or_privileged,
    get_current_user,
    require_hr,
    require_super_admin,
)
from app.core.pagination import PageParams, build_page
from app.core.storage import get_storage
from app.models.user import User
from app.schemas.common import Message, Page
from app.schemas.payroll import (
    LatestPayslipOut,
    PayrollRunCreate,
    PayrollRunDetailed,
    PayrollRunOut,
    PayslipOut,
)
from app.services import payroll_service

router = APIRouter(prefix="/payroll", tags=["payroll"])


# ---- Runs ----
@router.get("/runs", response_model=Page[PayrollRunOut])
def list_runs(
    params: PageParams = Depends(),
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    rows, total = payroll_service.list_runs(db, params)
    return build_page(rows, total, params)


@router.post("/runs", response_model=PayrollRunDetailed, status_code=201)
def create_run(
    payload: PayrollRunCreate, db: Session = Depends(get_db), current: User = Depends(require_hr)
):
    run = payroll_service.create_run(db, payload, actor=current)
    return PayrollRunDetailed.model_validate(run)


@router.get("/runs/{run_id}", response_model=PayrollRunDetailed)
def get_run(run_id: int, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    return PayrollRunDetailed.model_validate(payroll_service.get_run(db, run_id))


@router.post("/runs/{run_id}/recompute", response_model=PayrollRunDetailed)
def recompute(run_id: int, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    return PayrollRunDetailed.model_validate(payroll_service.recompute_run(db, run_id, actor=current))


@router.post("/runs/{run_id}/submit", response_model=PayrollRunDetailed)
def submit(run_id: int, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    return PayrollRunDetailed.model_validate(payroll_service.submit_for_review(db, run_id, actor=current))


@router.post("/runs/{run_id}/approve", response_model=PayrollRunDetailed)
def approve(run_id: int, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    return PayrollRunDetailed.model_validate(payroll_service.approve_run(db, run_id, actor=current))


@router.post("/runs/{run_id}/reopen", response_model=PayrollRunDetailed)
def reopen(run_id: int, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    return PayrollRunDetailed.model_validate(payroll_service.reopen_run(db, run_id, actor=current))


@router.post("/runs/{run_id}/lock", response_model=PayrollRunDetailed)
def lock(run_id: int, db: Session = Depends(get_db), current: User = Depends(require_super_admin)):
    return PayrollRunDetailed.model_validate(payroll_service.lock_run(db, run_id, actor=current))


@router.delete("/runs/{run_id}", response_model=Message)
def delete(run_id: int, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    payroll_service.delete_run(db, run_id, actor=current)
    return Message(message="Deleted")


# ---- Payslips ----
@router.get("/payslips/me", response_model=list[PayslipOut])
def my_payslips(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    if current.employee_id is None:
        raise HTTPException(status_code=400, detail="No employee linked to this account")
    return [PayslipOut.model_validate(p) for p in payroll_service.employee_payslips(db, current.employee_id)]


@router.get("/payslips/me/latest", response_model=Optional[LatestPayslipOut])
def my_latest_payslip(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Compact summary of the signed-in employee's latest finalized payslip
    (net pay + pay date) for the dashboard. Returns null when none exists."""
    if current.employee_id is None:
        raise HTTPException(status_code=400, detail="No employee linked to this account")
    return payroll_service.latest_payslip_summary(db, current.employee_id)


@router.get("/payslips/by-employee/{employee_id}", response_model=list[PayslipOut])
def payslips_for(
    employee_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)
):
    ensure_self_or_privileged(current, employee_id)
    return [PayslipOut.model_validate(p) for p in payroll_service.employee_payslips(db, employee_id)]


@router.get("/payslips/detail/{detail_id}/download")
def download_payslip(
    detail_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)
):
    from app.models.payroll import PayrollDetail

    detail = db.get(PayrollDetail, detail_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Payroll detail not found")
    ensure_self_or_privileged(current, detail.employee_id)
    payslip = payroll_service.get_or_generate_payslip(db, detail_id=detail_id, actor=current)
    data = get_storage().load(payslip.file_key)
    is_pdf = (data[:4] == b"%PDF") if data else False
    media_type = "application/pdf" if is_pdf else "text/html; charset=utf-8"
    ext = "pdf" if is_pdf else "html"
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename=payslip_{detail.employee_id}_{detail.run_id}.{ext}"
        },
    )
