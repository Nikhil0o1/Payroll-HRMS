"""Employee endpoints."""
from __future__ import annotations

import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.crypto import mask_bank_account
from app.core.deps import (
    ensure_self_or_privileged,
    get_current_user,
    is_privileged,
    require_hr,
    require_manager,
    require_step_up,
)
from app.core.pagination import PageParams, build_page
from app.models.enums import BankDetailChangeStatus, EmployeeStatus
from app.models.user import User
from app.schemas.common import Message, Page
from app.schemas.employee import (
    BankAccountRevealOut,
    BankDetailChangeDecision,
    BankDetailChangeRequestOut,
    EmployeeCreate,
    EmployeeListItem,
    EmployeeOut,
    EmployeeProfileOut,
    EmployeeProfileUpdate,
    EmployeeUpdate,
)
from app.services import employee_service

router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("", response_model=Page[EmployeeListItem])
def list_employees(
    department: Optional[str] = None,
    status: Optional[EmployeeStatus] = None,
    manager_id: Optional[int] = Query(None, description="Filter by manager"),
    params: PageParams = Depends(),
    db: Session = Depends(get_db),
    current: User = Depends(require_manager),
) -> dict:
    # Managers without privilege only see their reports + themselves.
    if not is_privileged(current) and current.role.name.value == "MANAGER":
        manager_id = current.employee_id
    rows, total = employee_service.list_employees(
        db, params, department=department, status=status, manager_id=manager_id
    )
    return build_page(rows, total, params)


@router.get("/bank-change-requests/pending", response_model=list[BankDetailChangeRequestOut])
def pending_bank_change_requests(
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
) -> list[BankDetailChangeRequestOut]:
    rows = employee_service.list_bank_detail_change_requests(
        db, status=BankDetailChangeStatus.PENDING
    )
    return [employee_service.bank_change_out_for_user(r, current) for r in rows]


@router.post(
    "/bank-change-requests/{request_id}/approve",
    response_model=BankDetailChangeRequestOut,
)
def approve_bank_change_request(
    request_id: int,
    payload: BankDetailChangeDecision | None = None,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
) -> BankDetailChangeRequestOut:
    req = employee_service.approve_bank_detail_change_request(
        db, request_id, actor=current, note=payload.note if payload else None
    )
    return employee_service.bank_change_out_for_user(req, current)


@router.post(
    "/bank-change-requests/{request_id}/reject",
    response_model=BankDetailChangeRequestOut,
)
def reject_bank_change_request(
    request_id: int,
    payload: BankDetailChangeDecision | None = None,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
) -> BankDetailChangeRequestOut:
    req = employee_service.reject_bank_detail_change_request(
        db, request_id, actor=current, note=payload.note if payload else None
    )
    return employee_service.bank_change_out_for_user(req, current)


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> EmployeeOut:
    ensure_self_or_privileged(current, employee_id)
    emp = employee_service.get_with_profile(db, employee_id)
    return employee_service.employee_out_for_user(db, emp, current)


@router.post("", response_model=EmployeeOut, status_code=201)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
) -> EmployeeOut:
    emp = employee_service.create_employee(db, payload, actor=current)
    return employee_service.employee_out_for_user(
        db, employee_service.get_with_profile(db, emp.id), current
    )


# ───────── Bulk import (CSV) ─────────


@router.get("/import/template")
def import_template(current: User = Depends(require_hr)) -> PlainTextResponse:
    """Download a CSV template with the expected columns + one example row."""
    header = ",".join(employee_service.IMPORT_COLUMNS)
    example = "Aarav,Sharma,aarav.sharma@company.com,Engineering,Software Engineer,2024-01-15,FULL_TIME,1200000"
    body = f"{header}\n{example}\n"
    return PlainTextResponse(
        body,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=employees_template.csv"},
    )


@router.post("/import")
async def import_employees(
    file: UploadFile = File(...),
    send_invites: bool = Query(False, description="Create login accounts + email invites for each row"),
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
) -> dict:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV must include a header row.")
    rows = [{(k or "").strip(): (v or "").strip() for k, v in r.items()} for r in reader]
    if not rows:
        raise HTTPException(status_code=400, detail="No data rows found below the header.")
    if len(rows) > 1000:
        raise HTTPException(status_code=400, detail="Please import at most 1000 rows at a time.")
    return employee_service.bulk_import_employees(db, rows, actor=current, send_invites=send_invites)


@router.patch("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
) -> EmployeeOut:
    emp = employee_service.update_employee(db, employee_id, payload, actor=current)
    return employee_service.employee_out_for_user(
        db, employee_service.get_with_profile(db, emp.id), current
    )


@router.post("/{employee_id}/deactivate", response_model=EmployeeOut)
def deactivate(employee_id: int, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    emp = employee_service.deactivate(db, employee_id, actor=current)
    return employee_service.employee_out_for_user(
        db, employee_service.get_with_profile(db, emp.id), current
    )


@router.post("/{employee_id}/reactivate", response_model=EmployeeOut)
def reactivate(employee_id: int, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    emp = employee_service.reactivate(db, employee_id, actor=current)
    return employee_service.employee_out_for_user(
        db, employee_service.get_with_profile(db, emp.id), current
    )


@router.put("/{employee_id}/profile", response_model=EmployeeProfileOut)
def update_profile(
    employee_id: int,
    payload: EmployeeProfileUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> EmployeeProfileOut:
    ensure_self_or_privileged(current, employee_id)
    employee_service.update_profile(db, employee_id, payload, actor=current)
    emp = employee_service.get_with_profile(db, employee_id)
    out = employee_service.employee_out_for_user(db, emp, current)
    if out.profile is None:
        raise HTTPException(status_code=500, detail="Employee profile was not created")
    return out.profile


@router.get("/{employee_id}/bank-change-requests", response_model=list[BankDetailChangeRequestOut])
def bank_change_requests_for_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[BankDetailChangeRequestOut]:
    ensure_self_or_privileged(current, employee_id)
    rows = employee_service.list_bank_detail_change_requests(db, employee_id=employee_id)
    return [employee_service.bank_change_out_for_user(r, current) for r in rows]


@router.post("/{employee_id}/bank-account/reveal", response_model=BankAccountRevealOut)
def reveal_bank_account(
    employee_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
    _step_up: User = Depends(require_step_up("BANK_ACCOUNT_REVEAL")),
) -> BankAccountRevealOut:
    account_no = employee_service.reveal_bank_account(
        db,
        employee_id,
        actor=current,
        ip=request.client.host if request.client else None,
    )
    return BankAccountRevealOut(
        employee_id=employee_id,
        bank_account_no=account_no,
        bank_account_no_masked=mask_bank_account(account_no),
    )


# ───────── Profile photo (avatar) ─────────


@router.post("/{employee_id}/avatar", response_model=EmployeeOut)
async def upload_avatar(
    employee_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> EmployeeOut:
    """Upload a profile photo. An employee may set their own; HR/Admin may set
    anyone's. The image is squared, downscaled and stored inline so it shows up
    everywhere the person appears (top bar, directory, their detail page)."""
    ensure_self_or_privileged(current, employee_id)
    if not (file.content_type or "").lower().startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image (PNG, JPG, GIF or WebP).")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(raw) > employee_service.AVATAR_MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image must be 5 MB or smaller.")
    data_url = employee_service.process_avatar(raw)
    emp = employee_service.set_avatar(db, employee_id, data_url, actor=current)
    return employee_service.employee_out_for_user(db, emp, current)


@router.delete("/{employee_id}/avatar", response_model=EmployeeOut)
def delete_avatar(
    employee_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> EmployeeOut:
    ensure_self_or_privileged(current, employee_id)
    emp = employee_service.set_avatar(db, employee_id, None, actor=current)
    return employee_service.employee_out_for_user(db, emp, current)
