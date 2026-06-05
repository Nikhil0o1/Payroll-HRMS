# Database Schema

PostgreSQL (SQLite-compatible for dev). All tables use `created_at` / `updated_at` timestamps. PKs are integers (swap to UUID if multi-region writes are needed).

## Identity & RBAC

### roles
| col | type | notes |
|-----|------|-------|
| id | int PK | |
| name | enum | EMPLOYEE, MANAGER, HR_ADMIN, SUPER_ADMIN |
| description | text | |

### users
| col | type | notes |
|-----|------|-------|
| id | int PK | |
| email | citext unique | login id |
| hashed_password | text | bcrypt |
| role_id | fk roles | |
| is_active | bool | |
| employee_id | fk employees (nullable) | links login → employee record |
| last_login_at | ts | |

### refresh_tokens
| col | type | notes |
|-----|------|-------|
| id | int PK | |
| user_id | fk users | |
| token_hash | text | sha256 of rotating token |
| expires_at | ts | |
| revoked | bool | |

## Employee

### employees
| col | type | notes |
|-----|------|-------|
| id | int PK | |
| employee_code | str unique | e.g. EMP0007 |
| first_name / last_name | str | |
| work_email | str | |
| personal_email / phone | str | |
| date_of_joining | date | |
| date_of_exit | date null | |
| department / designation | str | |
| manager_id | fk employees null | self-ref → reporting line |
| employment_type | enum | FULL_TIME, PART_TIME, CONTRACT, INTERN |
| status | enum | ACTIVE, INACTIVE |

### employee_profiles (1:1 with employees)
PII & extended fields: dob, gender, address, bank (account no, ifsc, bank name), tax ids (pan), emergency contacts (json), photo_key.

## Attendance

### attendance_logs  ← **raw, immutable**
| col | type | notes |
|-----|------|-------|
| id | int PK | |
| employee_id | fk | |
| timestamp | ts | punch moment |
| type | enum | IN / OUT |
| source | enum | WEB, BIOMETRIC, IMPORT, REGULARIZATION |
| created_by | fk users null | |

Index: `(employee_id, timestamp)`.

### attendance_daily  ← **derived projection**
| col | type | notes |
|-----|------|-------|
| id | int PK | |
| employee_id | fk | |
| work_date | date | |
| first_in / last_out | ts null | |
| worked_minutes | int | sum of IN→OUT pairs |
| status | enum | PRESENT, ABSENT, HALF_DAY, ON_LEAVE, HOLIDAY, WEEKEND |
| is_late | bool | first_in after policy start |
| has_missing_punch | bool | odd number of punches |
| is_locked | bool | frozen by a locked payroll run |

Unique: `(employee_id, work_date)`.

## Leave

### leave_types
id, code (CASUAL/SICK/EARNED), name, default_annual_quota, is_paid, color.

### leave_balances
| col | type | notes |
|-----|------|-------|
| employee_id, leave_type_id, year | composite unique | |
| allotted / used / pending | numeric(5,1) | supports half-days |

### leave_requests
| col | type | notes |
|-----|------|-------|
| id | int PK | |
| employee_id, leave_type_id | fk | |
| start_date, end_date | date | |
| days | numeric(4,1) | |
| reason | text | |
| status | enum | PENDING, APPROVED, REJECTED, CANCELLED |
| approver_id | fk users null | |
| decided_at | ts | |
| decision_note | text | |

## Regularization

### regularization_requests
id, employee_id, work_date, type (MISSING_IN/MISSING_OUT/WRONG_TIME/OTHER), requested_in, requested_out, reason, status (PENDING/APPROVED/REJECTED), reviewer_id, decided_at, decision_note. On approval → inserts `attendance_logs` with source=REGULARIZATION + recomputes daily.

## Holidays

### holidays
id, name, date, type (PUBLIC/OPTIONAL), year, description. Unique `(date, name)`.

## Payroll

### salary_structures (versioned per employee)
| col | type | notes |
|-----|------|-------|
| id | int PK | |
| employee_id | fk | |
| effective_from | date | |
| ctc_annual | numeric(12,2) | |
| components | json | list of {code, name, type: EARNING/DEDUCTION, calc: FIXED/PERCENT_OF_BASIC, value} |
| is_active | bool | |

### payroll_runs
| col | type | notes |
|-----|------|-------|
| id | int PK | |
| period_year, period_month | int | unique together |
| status | enum | DRAFT, REVIEW, APPROVED, LOCKED |
| total_gross / total_deductions / total_net | numeric | |
| run_by | fk users | |
| locked_at, locked_by | | |

### payroll_details (snapshot per employee per run)
| col | type | notes |
|-----|------|-------|
| run_id, employee_id | fk | |
| payable_days, present_days, lop_days | numeric | snapshot |
| earnings | json | resolved line items |
| deductions | json | resolved line items |
| gross, total_deductions, net_pay | numeric | |
| salary_snapshot | json | structure used at lock time |

### payslips
id, payroll_detail_id, employee_id, run_id, file_key, generated_at. PDF via WeasyPrint, stored via Storage.

## Audit

### audit_logs  ← **append-only**
| col | type | notes |
|-----|------|-------|
| id | int PK | |
| actor_user_id | fk null | |
| action | str | e.g. payroll.lock |
| entity | str | table/aggregate |
| entity_id | str | |
| before | json null | |
| after | json null | |
| ip | str | |
| created_at | ts | |

## Relationships summary
- users 1—1 employees (a login may map to an employee)
- employees self-ref manager_id (reporting tree)
- employees 1—1 employee_profiles
- employees 1—* attendance_logs / leave_requests / regularization_requests / salary_structures
- payroll_runs 1—* payroll_details 1—1 payslips
