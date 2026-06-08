"""Report (Excel) export endpoints — generated asynchronously."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.audit import record_audit
from app.core.deps import require_hr, require_step_up
from app.models.user import User
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])

XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _stream(data: bytes, filename: str) -> StreamingResponse:
    def _it():
        yield data

    return StreamingResponse(
        _it(),
        media_type=XLSX_MEDIA,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/attendance")
def attendance_report(year: int, month: int, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    data = report_service.attendance_report(db, year=year, month=month)
    return _stream(data, f"attendance_{year}_{month:02d}.xlsx")


@router.get("/leaves")
def leaves_report(year: int, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    data = report_service.leave_report(db, year=year)
    return _stream(data, f"leaves_{year}.xlsx")


@router.get("/payroll")
def payroll_report(run_id: int, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    try:
        data = report_service.payroll_report(db, run_id=run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _stream(data, f"payroll_run_{run_id}.xlsx")


@router.get("/bank-transfer")
def bank_transfer_export(
    run_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
    _step_up: User = Depends(require_step_up("BANK_TRANSFER_EXPORT")),
):
    try:
        data, row_count = report_service.bank_transfer_export(db, run_id=run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    record_audit(
        db,
        actor=current,
        action="report.bank_transfer_export",
        entity="payroll_runs",
        entity_id=run_id,
        ip=request.client.host if request.client else None,
        after={"row_count": row_count},
    )
    db.commit()
    return _stream(data, f"bank_transfer_run_{run_id}.xlsx")


@router.get("/employees")
def employees_report(db: Session = Depends(get_db), current: User = Depends(require_hr)):
    data = report_service.employees_report(db)
    return _stream(data, "employees.xlsx")
