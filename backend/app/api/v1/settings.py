"""Settings endpoints: organisation profile, work locations, salary
components, salary templates, pay schedule, and user / role admin.

All endpoints in this module require HR_ADMIN or higher.
"""
from __future__ import annotations

from typing import List, Optional

import base64

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_hr, require_super_admin
from app.models.user import User
from app.schemas.common import Message
from app.schemas.organization import (
    InviteUserRequest,
    InviteUserResponse,
    OrganizationProfileOut,
    OrganizationProfileUpdate,
    PayScheduleOut,
    PayScheduleUpdate,
    RoleOut,
    SalaryComponentCreate,
    SalaryComponentOut,
    SalaryComponentUpdate,
    SalaryTemplateCreate,
    SalaryTemplateOut,
    SalaryTemplateUpdate,
    UserListItem,
    WorkLocationCreate,
    WorkLocationOut,
    WorkLocationUpdate,
)
from app.services import organization_service

router = APIRouter(prefix="/settings", tags=["settings"])


# ───────── Organisation profile ─────────


@router.get("/organisation", response_model=OrganizationProfileOut)
def get_organisation(
    db: Session = Depends(get_db), current: User = Depends(require_hr)
):
    return OrganizationProfileOut.model_validate(organization_service.get_profile(db))


class OrganisationBrandingOut(BaseModel):
    name: str
    logo_key: Optional[str] = None


@router.get("/organisation/branding", response_model=OrganisationBrandingOut)
def get_organisation_branding(
    db: Session = Depends(get_db), current: User = Depends(get_current_user)
):
    """Org name + logo for the app-shell top bar. Readable by any signed-in
    user (employees see it too), unlike the rest of /settings which is HR-only."""
    p = organization_service.get_profile(db)
    return OrganisationBrandingOut(name=p.name, logo_key=p.logo_key)


@router.put("/organisation", response_model=OrganizationProfileOut)
def update_organisation(
    payload: OrganizationProfileUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    return OrganizationProfileOut.model_validate(
        organization_service.update_profile(db, payload, actor=current)
    )


_LOGO_MIME_BY_EXT = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "svg": "image/svg+xml",
    "webp": "image/webp",
}
_MAX_LOGO_BYTES = 1 * 1024 * 1024  # 1 MB ceiling (mirrors Zoho copy)


@router.post("/organisation/logo", response_model=OrganizationProfileOut)
async def upload_organisation_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    """Upload the organisation logo. Stored as a base64 data URL on the
    profile so it can be inlined on payslips / dashboards without a separate
    static-asset host. Capped at 1 MB."""
    content_type = (file.content_type or "").lower()
    filename = (file.filename or "").lower()
    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    mime = _LOGO_MIME_BY_EXT.get(ext) or content_type
    if not mime.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image (png, jpg, gif, svg, webp).",
        )
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(raw) > _MAX_LOGO_BYTES:
        raise HTTPException(status_code=400, detail="Logo must be 1 MB or smaller.")
    data_url = f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"
    updated = organization_service.set_profile_logo(db, data_url, actor=current)
    return OrganizationProfileOut.model_validate(updated)


@router.delete("/organisation/logo", response_model=OrganizationProfileOut)
def delete_organisation_logo(
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    updated = organization_service.set_profile_logo(db, None, actor=current)
    return OrganizationProfileOut.model_validate(updated)


# ───────── Work locations ─────────


@router.get("/work-locations", response_model=List[WorkLocationOut])
def list_work_locations(
    db: Session = Depends(get_db), current: User = Depends(require_hr)
):
    return [
        WorkLocationOut.model_validate(loc)
        for loc in organization_service.list_work_locations(db)
    ]


@router.post("/work-locations", response_model=WorkLocationOut, status_code=201)
def create_work_location(
    payload: WorkLocationCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    return WorkLocationOut.model_validate(
        organization_service.create_work_location(db, payload, actor=current)
    )


@router.patch("/work-locations/{location_id}", response_model=WorkLocationOut)
def update_work_location(
    location_id: int,
    payload: WorkLocationUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    return WorkLocationOut.model_validate(
        organization_service.update_work_location(db, location_id, payload, actor=current)
    )


@router.delete("/work-locations/{location_id}", response_model=Message)
def delete_work_location(
    location_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    organization_service.delete_work_location(db, location_id, actor=current)
    return Message(message="Deleted")


# ───────── Salary components ─────────


@router.get("/salary-components", response_model=List[SalaryComponentOut])
def list_salary_components(
    category: Optional[str] = Query(None, description="EARNING | DEDUCTION | REIMBURSEMENT"),
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    return [
        SalaryComponentOut.model_validate(c)
        for c in organization_service.list_salary_components(db, category=category)
    ]


@router.post("/salary-components", response_model=SalaryComponentOut, status_code=201)
def create_salary_component(
    payload: SalaryComponentCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    return SalaryComponentOut.model_validate(
        organization_service.create_salary_component(db, payload, actor=current)
    )


@router.patch("/salary-components/{component_id}", response_model=SalaryComponentOut)
def update_salary_component(
    component_id: int,
    payload: SalaryComponentUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    return SalaryComponentOut.model_validate(
        organization_service.update_salary_component(db, component_id, payload, actor=current)
    )


@router.delete("/salary-components/{component_id}", response_model=Message)
def delete_salary_component(
    component_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    organization_service.delete_salary_component(db, component_id, actor=current)
    return Message(message="Deleted")


# ───────── Salary templates ─────────


@router.get("/salary-templates", response_model=List[SalaryTemplateOut])
def list_salary_templates(
    db: Session = Depends(get_db), current: User = Depends(require_hr)
):
    return [
        SalaryTemplateOut.model_validate(t)
        for t in organization_service.list_salary_templates(db)
    ]


@router.post("/salary-templates", response_model=SalaryTemplateOut, status_code=201)
def create_salary_template(
    payload: SalaryTemplateCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    return SalaryTemplateOut.model_validate(
        organization_service.create_salary_template(db, payload, actor=current)
    )


@router.get("/salary-templates/{template_id}", response_model=SalaryTemplateOut)
def get_salary_template(
    template_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    return SalaryTemplateOut.model_validate(
        organization_service.get_salary_template(db, template_id)
    )


@router.patch("/salary-templates/{template_id}", response_model=SalaryTemplateOut)
def update_salary_template(
    template_id: int,
    payload: SalaryTemplateUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    return SalaryTemplateOut.model_validate(
        organization_service.update_salary_template(db, template_id, payload, actor=current)
    )


@router.delete("/salary-templates/{template_id}", response_model=Message)
def delete_salary_template(
    template_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    organization_service.delete_salary_template(db, template_id, actor=current)
    return Message(message="Deleted")


# ───────── Pay schedule ─────────


@router.get("/pay-schedule", response_model=PayScheduleOut)
def get_pay_schedule(
    db: Session = Depends(get_db), current: User = Depends(require_hr)
):
    return PayScheduleOut.model_validate(organization_service.get_pay_schedule(db))


@router.put("/pay-schedule", response_model=PayScheduleOut)
def update_pay_schedule(
    payload: PayScheduleUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    return PayScheduleOut.model_validate(
        organization_service.update_pay_schedule(db, payload, actor=current)
    )


# ───────── Users & Roles ─────────


@router.get("/users", response_model=List[UserListItem])
def list_users(db: Session = Depends(get_db), current: User = Depends(require_hr)):
    return [UserListItem.model_validate(u) for u in organization_service.list_users(db)]


@router.post("/users/invite", response_model=InviteUserResponse, status_code=201)
def invite_user(
    payload: InviteUserRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_hr),
):
    return InviteUserResponse.model_validate(
        organization_service.invite_user(db, payload, actor=current)
    )


@router.post("/users/{user_id}/activate", response_model=Message)
def activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_super_admin),
):
    organization_service.set_user_active(db, user_id, active=True, actor=current)
    return Message(message="Activated")


@router.post("/users/{user_id}/deactivate", response_model=Message)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_super_admin),
):
    organization_service.set_user_active(db, user_id, active=False, actor=current)
    return Message(message="Deactivated")


@router.get("/roles", response_model=List[RoleOut])
def list_roles(db: Session = Depends(get_db), current: User = Depends(require_hr)):
    return [RoleOut.model_validate(r) for r in organization_service.list_roles(db)]
