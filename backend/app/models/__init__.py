"""Import all models so SQLAlchemy's metadata + Alembic see every table."""
from app.core.database import Base  # noqa: F401
from app.models.audit import AuditLog  # noqa: F401
from app.models.attendance import AttendanceDaily, AttendanceLog  # noqa: F401
from app.models.employee import Employee, EmployeeProfile  # noqa: F401
from app.models.holiday import Holiday  # noqa: F401
from app.models.leave import LeaveBalance, LeaveRequest, LeaveType  # noqa: F401
from app.models.payroll import (  # noqa: F401
    PayrollDetail,
    PayrollRun,
    Payslip,
    SalaryStructure,
)
from app.models.regularization import RegularizationRequest  # noqa: F401
from app.models.user import RefreshToken, Role, User  # noqa: F401
from app.models.organization import (
    OrganizationProfile,
    WorkLocation,
    SalaryComponentDef,
    SalaryTemplate,
)  # noqa: F401

__all__ = [
    "Base",
    "AuditLog",
    "AttendanceDaily",
    "AttendanceLog",
    "Employee",
    "EmployeeProfile",
    "Holiday",
    "LeaveBalance",
    "LeaveRequest",
    "LeaveType",
    "PayrollDetail",
    "PayrollRun",
    "Payslip",
    "SalaryStructure",
    "RegularizationRequest",
    "RefreshToken",
    "Role",
    "User",
    "OrganizationProfile",
    "WorkLocation",
    "SalaryComponentDef",
    "SalaryTemplate",
]
