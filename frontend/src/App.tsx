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
import { BirthdaysPage } from "@/pages/Birthdays";
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
import OrganisationProfile from "@/pages/settings/OrganisationProfile";
import WorkLocations from "@/pages/settings/WorkLocations";
import Shifts from "@/pages/settings/Shifts";
import SalaryComponents from "@/pages/settings/SalaryComponents";
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
          path="birthdays"
          element={
            <RoleGuard min="HR_ADMIN">
              <BirthdaysPage />
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

        {/* Settings pages (HR_ADMIN+) — surfaced directly in the main sidebar */}
        <Route path="settings" element={<Navigate to="/settings/organisation" replace />} />
        <Route
          path="settings/organisation"
          element={
            <RoleGuard min="HR_ADMIN">
              <OrganisationProfile />
            </RoleGuard>
          }
        />
        <Route
          path="settings/work-locations"
          element={
            <RoleGuard min="HR_ADMIN">
              <WorkLocations />
            </RoleGuard>
          }
        />
        <Route
          path="settings/shifts"
          element={
            <RoleGuard min="HR_ADMIN">
              <Shifts />
            </RoleGuard>
          }
        />
        <Route
          path="settings/salary-components"
          element={
            <RoleGuard min="HR_ADMIN">
              <SalaryComponents />
            </RoleGuard>
          }
        />
        <Route
          path="settings/pay-schedule"
          element={
            <RoleGuard min="HR_ADMIN">
              <PaySchedule />
            </RoleGuard>
          }
        />
        <Route
          path="settings/announcements"
          element={
            <RoleGuard min="HR_ADMIN">
              <Announcements />
            </RoleGuard>
          }
        />
        <Route
          path="settings/users-roles"
          element={
            <RoleGuard min="HR_ADMIN">
              <UsersRoles />
            </RoleGuard>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
