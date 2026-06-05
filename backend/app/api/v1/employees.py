"""Employee endpoints."""
from __future__ import annotations

import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    ensure_self_or_privileged,
    get_current_user,
    is_privileged,
    require_hr,
    require_manager,
)
from app.core.pagination import PageParams, build_page
from app.models.enums import EmployeeStatus
from app.models.user import User
from app.schemas.common import Message, Page
from app.schemas.employee import (
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


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> EmployeeOut:
    ensure_self_or_privileged(current, employee_id)
    emp = employee_service.get_with_profile(db, employee_id)
    return EmployeeOut.model_validate(emp)


@router.post("", response_model=EmployeeOut, status_code=201)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
) -> EmployeeOut:
    emp = employee_service.create_employee(db, payload, actor=current)
    return EmployeeOut.model_validate(employee_service.get_with_profile(db, emp.id))


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
    return EmployeeOut.model_validate(employee_service.get_with_profile(db, emp.id))


@router.post("/{employee_id}/deactivate", response_model=EmployeeOut)
def deactivate(employee_id: int, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    emp = employee_service.deactivate(db, employee_id, actor=current)
    return EmployeeOut.model_validate(employee_service.get_with_profile(db, emp.id))


@router.post("/{employee_id}/reactivate", response_model=EmployeeOut)
def reactivate(employee_id: int, db: Session = Depends(get_db), current: User = Depends(require_hr)):
    emp = employee_service.reactivate(db, employee_id, actor=current)
    return EmployeeOut.model_validate(employee_service.get_with_profile(db, emp.id))


@router.put("/{employee_id}/profile", response_model=EmployeeProfileOut)
def update_profile(
    employee_id: int,
    payload: EmployeeProfileUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> EmployeeProfileOut:
    ensure_self_or_privileged(current, employee_id)
    profile = employee_service.update_profile(db, employee_id, payload, actor=current)
    return EmployeeProfileOut.model_validate(profile)
