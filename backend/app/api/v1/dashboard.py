"""Dashboard endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_manager
from app.models.user import User
from app.schemas.dashboard import AdminDashboardMetrics, EmployeeDashboard, PayrollCostPoint
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/admin", response_model=AdminDashboardMetrics)
def admin_dashboard(db: Session = Depends(get_db), current: User = Depends(require_manager)):
    return dashboard_service.admin_metrics(db)


@router.get("/payroll-cost", response_model=list[PayrollCostPoint])
def payroll_cost(db: Session = Depends(get_db), current: User = Depends(require_manager)):
    return dashboard_service.payroll_cost_breakdown(db)


@router.get("/me", response_model=EmployeeDashboard)
def employee_dashboard(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    if current.employee_id is None:
        raise HTTPException(status_code=400, detail="No employee linked to this account")
    return dashboard_service.employee_dashboard(db, employee_id=current.employee_id)
