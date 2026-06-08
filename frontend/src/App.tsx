import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGuard, RoleGuard } from "@/components/auth-guard";
import { AppLayout } from "@/components/app-layout";
import { LoginPage } from "@/pages/Login";
import { SignupPage } from "@/pages/Signup";
import { DashboardPage } from "@/pages/Dashboard";
import { AttendancePage } from "@/pages/Attendance";
import { LeavesPage } from "@/pages/Leaves";
import { RegularizationsPage } from "@/pages/Regularizations";
import { HolidaysPage } from "@/pages/Holidays";
import { LeaveTypesPage } from "@/pages/LeaveTypes";
import { PayslipsPage } from "@/pages/Payslips";
import { EmployeesPage } from "@/pages/Employees";
import { EmployeeDetailPage } from "@/pages/EmployeeDetail";
import { PayrollPage } from "@/pages/Payroll";
import { PayrollRunPage } from "@/pages/PayrollRun";
import { ReportsPage } from "@/pages/Reports";
import { AuditLogsPage } from "@/pages/AuditLogs";
import { ProfilePage } from "@/pages/Profile";
import { NotFoundPage } from "@/pages/NotFound";
import { SettingsLayout } from "@/pages/settings/SettingsLayout";
import OrganisationProfile from "@/pages/settings/OrganisationProfile";
import WorkLocations from "@/pages/settings/WorkLocations";
import Shifts from "@/pages/settings/Shifts";
import SalaryComponents from "@/pages/settings/SalaryComponents";
import SalaryTemplates from "@/pages/settings/SalaryTemplates";
import PaySchedule from "@/pages/settings/PaySchedule";
import UsersRoles from "@/pages/settings/UsersRoles";
import Announcements from "@/pages/settings/Announcements";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        element={
          <AuthGuard>
            <AppLayout />
          </AuthGuard>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="leaves" element={<LeavesPage />} />
        <Route path="regularizations" element={<RegularizationsPage />} />
        <Route path="holidays" element={<HolidaysPage />} />
        <Route path="payslips" element={<PayslipsPage />} />
        <Route path="profile" element={<ProfilePage />} />

        <Route
          path="employees"
          element={
            <RoleGuard min="HR_ADMIN">
              <EmployeesPage />
            </RoleGuard>
          }
        />
        <Route
          path="employees/:id"
          element={
            <RoleGuard min="HR_ADMIN">
              <EmployeeDetailPage />
            </RoleGuard>
          }
        />
        <Route
          path="payroll"
          element={
            <RoleGuard min="HR_ADMIN">
              <PayrollPage />
            </RoleGuard>
          }
        />
        <Route
          path="payroll/runs/:id"
          element={
            <RoleGuard min="HR_ADMIN">
              <PayrollRunPage />
            </RoleGuard>
          }
        />
        <Route
          path="reports"
          element={
            <RoleGuard min="HR_ADMIN">
              <ReportsPage />
            </RoleGuard>
          }
        />
        <Route
          path="audit-logs"
          element={
            <RoleGuard min="HR_ADMIN">
              <AuditLogsPage />
            </RoleGuard>
          }
        />
        <Route
          path="leave-types"
          element={
            <RoleGuard min="HR_ADMIN">
              <LeaveTypesPage />
            </RoleGuard>
          }
        />

        {/* Settings (HR_ADMIN+) — nested layout with vertical sub-nav */}
        <Route
          path="settings"
          element={
            <RoleGuard min="HR_ADMIN">
              <SettingsLayout />
            </RoleGuard>
          }
        >
          <Route index element={<Navigate to="organisation" replace />} />
          <Route path="organisation" element={<OrganisationProfile />} />
          <Route path="work-locations" element={<WorkLocations />} />
          <Route path="shifts" element={<Shifts />} />
          <Route path="salary-components" element={<SalaryComponents />} />
          <Route path="salary-templates" element={<SalaryTemplates />} />
          <Route path="pay-schedule" element={<PaySchedule />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="users-roles" element={<UsersRoles />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
