// Mirrors backend Pydantic schemas.

export type Role = "EMPLOYEE" | "MANAGER" | "HR_ADMIN" | "SUPER_ADMIN";
export type EmployeeStatus = "ACTIVE" | "INACTIVE";
export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";
export type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "HALF_DAY"
  | "ON_LEAVE"
  | "HOLIDAY"
  | "WEEKEND";
export type PunchType = "IN" | "OUT";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type RegularizationType = "MISSING_IN" | "MISSING_OUT" | "WRONG_TIME" | "OTHER";
export type RegularizationStatus = "PENDING" | "APPROVED" | "REJECTED";
export type HolidayType = "PUBLIC" | "OPTIONAL";
export type ComponentType = "EARNING" | "DEDUCTION";
export type CalcType = "FIXED" | "PERCENT_OF_BASIC" | "PERCENT_OF_CTC";
export type PayrollStatus = "DRAFT" | "REVIEW" | "APPROVED" | "LOCKED";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface MeEmployee {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  work_email: string;
  department?: string | null;
  designation?: string | null;
}

export interface Me {
  id: number;
  email: string;
  role: Role;
  is_active: boolean;
  last_login_at?: string | null;
  employee?: MeEmployee | null;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface Employee {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  work_email: string;
  personal_email?: string | null;
  phone?: string | null;
  department?: string | null;
  designation?: string | null;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  date_of_joining: string;
  date_of_exit?: string | null;
  manager_id?: number | null;
  profile?: EmployeeProfile | null;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface EmployeeProfile {
  id: number;
  employee_id: number;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  bank_account_no?: string | null;
  bank_ifsc?: string | null;
  bank_name?: string | null;
  pan?: string | null;
  emergency_contacts?: EmergencyContact[] | null;
}

export interface AttendanceLog {
  id: number;
  employee_id: number;
  timestamp: string;
  type: PunchType;
  source: string;
  note?: string | null;
}

export interface AttendanceDaily {
  id: number;
  employee_id: number;
  work_date: string;
  first_in?: string | null;
  last_out?: string | null;
  worked_minutes: number;
  status: AttendanceStatus;
  is_late: boolean;
  has_missing_punch: boolean;
  is_locked: boolean;
}

export interface TodayStatus {
  work_date: string;
  is_punched_in: boolean;
  last_punch_type?: PunchType | null;
  last_punch_at?: string | null;
  first_in?: string | null;
  last_out?: string | null;
  worked_minutes: number;
  status: AttendanceStatus;
}

export interface AttendanceSummary {
  employee_id: number;
  period_start: string;
  period_end: string;
  present_days: number;
  absent_days: number;
  half_days: number;
  leave_days: number;
  holiday_count: number;
  weekend_count: number;
  late_count: number;
  missing_punch_count: number;
  total_worked_minutes: number;
}

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  default_annual_quota: number;
  is_paid: boolean;
  color?: string | null;
}

export interface LeaveBalance {
  id: number;
  employee_id: number;
  leave_type_id: number;
  year: number;
  allotted: number;
  used: number;
  pending: number;
  available: number;
  leave_type?: LeaveType | null;
}

export interface LeaveRequest {
  id: number;
  employee_id: number;
  employee_name?: string | null;
  employee_code?: string | null;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  days: number;
  half_day: boolean;
  reason?: string | null;
  status: LeaveStatus;
  approver_user_id?: number | null;
  decided_at?: string | null;
  decision_note?: string | null;
  created_at?: string | null;
  leave_type?: LeaveType | null;
}

export interface RegularizationRequest {
  id: number;
  employee_id: number;
  employee_name?: string | null;
  employee_code?: string | null;
  work_date: string;
  type: RegularizationType;
  requested_in?: string | null;
  requested_out?: string | null;
  reason: string;
  status: RegularizationStatus;
  reviewer_user_id?: number | null;
  decided_at?: string | null;
  decision_note?: string | null;
  created_at?: string | null;
}

export interface Holiday {
  id: number;
  name: string;
  date: string;
  year: number;
  type: HolidayType;
  description?: string | null;
}

export interface SalaryComponent {
  code: string;
  name: string;
  type: ComponentType;
  calc: CalcType;
  value: number;
}

export interface SalaryStructure {
  id: number;
  employee_id: number;
  effective_from: string;
  ctc_annual: number;
  basic_monthly: number;
  components: SalaryComponent[];
  is_active: boolean;
}

export interface PayrollLineItem {
  code: string;
  name: string;
  amount: number;
}

export interface PayrollDetail {
  id: number;
  run_id: number;
  employee_id: number;
  employee_name?: string | null;
  employee_code?: string | null;
  working_days: number;
  present_days: number;
  paid_leave_days: number;
  lop_days: number;
  payable_days: number;
  earnings: PayrollLineItem[];
  deductions: PayrollLineItem[];
  gross: number;
  total_deductions: number;
  net_pay: number;
  salary_snapshot: Record<string, unknown>;
}

export interface PayrollRun {
  id: number;
  period_year: number;
  period_month: number;
  status: PayrollStatus;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  employee_count: number;
  run_by_user_id?: number | null;
  approved_by_user_id?: number | null;
  locked_by_user_id?: number | null;
  locked_at?: string | null;
  created_at?: string | null;
  details?: PayrollDetail[];
}

export interface Payslip {
  id: number;
  payroll_detail_id: number;
  employee_id: number;
  run_id: number;
  file_key?: string | null;
  generated_at?: string | null;
}

export interface PayrollMonthPoint {
  label: string;
  period_year: number;
  period_month: number;
  net: number;
  deductions: number;
  gross: number;
}

export interface RunSummary {
  id?: number | null;
  period_year: number;
  period_month: number;
  status?: PayrollStatus | null;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  employee_count: number;
}

export interface PayrollCostPoint {
  label: string;
  period_year: number;
  period_month: number;
  segments: Record<string, number>;
  total: number;
}

export interface AdminMetrics {
  total_employees: number;
  active_employees: number;
  present_today: number;
  absent_today: number;
  on_leave_today: number;
  pending_leave_approvals: number;
  pending_regularizations: number;
  upcoming_payroll_period?: string | null;
  last_locked_run?: string | null;
  currency?: string;
  current_run?: RunSummary | null;
  payroll_cost_series?: PayrollMonthPoint[];
  ytd_gross?: number;
  ytd_deductions?: number;
  ytd_net?: number;
}

export interface UpcomingHoliday {
  id: number;
  name: string;
  date: string;
  days_away: number;
}

export interface EmployeeDashboardData {
  today_status: TodayStatus;
  leave_balances: Array<{
    leave_type_id: number;
    leave_type?: LeaveType | null;
    allotted: number;
    used: number;
    pending: number;
    available: number;
  }>;
  upcoming_holidays: UpcomingHoliday[];
  pending_leaves: number;
  pending_regularizations: number;
  recent_payslip_run_ids: number[];
}

export interface AuditLog {
  id: number;
  actor_user_id?: number | null;
  actor_email?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  created_at?: string | null;
}

// ───────── Settings module ─────────

export interface OrganisationBranding {
  name: string;
  logo_key?: string | null;
}

export interface OrganisationProfile {
  id: number;
  name: string;
  legal_name?: string | null;
  industry?: string | null;
  business_location: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  date_format: string;
  currency: string;
  logo_key?: string | null;
}

export interface WorkLocation {
  id: number;
  name: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country: string;
  is_primary: boolean;
}

export type ComponentCategory = "EARNING" | "DEDUCTION" | "REIMBURSEMENT";

export interface SalaryComponentDef {
  id: number;
  code: string;
  name: string;
  category: ComponentCategory;
  calc_type: CalcType;
  calc_value: number;
  consider_for_epf: boolean;
  consider_for_esi: boolean;
  is_active: boolean;
}

export interface SalaryTemplateComponentLine {
  code: string;
  name: string;
  calc_type: CalcType;
  value: number;
}

export interface SalaryTemplate {
  id: number;
  name: string;
  description?: string | null;
  annual_ctc?: number | null;
  components: SalaryTemplateComponentLine[];
  is_active: boolean;
}

export interface PaySchedule {
  work_week: number[];
  salary_calc_basis: "actual" | "org_days";
  org_working_days?: number | null;
  pay_day_type: "last_working_day" | "fixed_day";
  pay_day?: number | null;
  first_payroll_month?: string | null;
}

export interface UserListItem {
  id: number;
  email: string;
  role: Role;
  is_active: boolean;
  last_login_at?: string | null;
  employee_id?: number | null;
  employee_name?: string | null;
  employee_code?: string | null;
}

export interface RoleRow {
  id: number;
  name: Role;
  description?: string | null;
}
