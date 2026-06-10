"""Top-level v1 router that aggregates every domain router."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    announcements,
    attendance,
    audit,
    auth,
    birthdays,
    dashboard,
    employees,
    holidays,
    leaves,
    notifications,
    payroll,
    regularizations,
    reports,
    salary,
    settings,
    shifts,
)

api_v1_router = APIRouter()
api_v1_router.include_router(auth.router)
api_v1_router.include_router(employees.router)
api_v1_router.include_router(attendance.router)
api_v1_router.include_router(leaves.router)
api_v1_router.include_router(regularizations.router)
api_v1_router.include_router(holidays.router)
api_v1_router.include_router(salary.router)
api_v1_router.include_router(payroll.router)
api_v1_router.include_router(reports.router)
api_v1_router.include_router(audit.router)
api_v1_router.include_router(birthdays.router)
api_v1_router.include_router(dashboard.router)
api_v1_router.include_router(settings.router)
api_v1_router.include_router(shifts.router)
api_v1_router.include_router(announcements.router)
api_v1_router.include_router(notifications.router)
