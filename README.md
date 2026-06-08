<div align="center">

# Payroll & HRMS Platform

A focused, production-grade payroll and HRMS system — attendance, leave, regularizations, payroll, payslips, reports — wrapped in a clean Zoho-style UI.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

> Not an ERP, not an all-in-one HR suite. It does a few things well — and looks like a real product while doing them.

---

## Table of contents

- [What's inside](#whats-inside)
- [Screenshots](#screenshots)
- [Tech stack](#tech-stack)
- [Architecture at a glance](#architecture-at-a-glance)
- [Quick start](#quick-start)
- [Default logins](#default-logins)
- [Configuration](#configuration)
- [API surface (v1)](#api-surface-v1)
- [Project structure](#project-structure)
- [Production checklist](#production-checklist)
- [Tests & quality gates](#tests--quality-gates)
- [Notes & tradeoffs](#notes--tradeoffs)
- [License](#license)

---

## What's inside

### People & access
- **Self-service signup** — employees register themselves; the first super-admin is bootstrapped from `.env` on startup.
- **Admin-created accounts** — when HR adds an employee, the platform generates a one-time password and emails the welcome credentials (SMTP or console backend).
- **4-tier RBAC** — `EMPLOYEE < MANAGER < HR_ADMIN < SUPER_ADMIN`, enforced server-side with FastAPI dependencies and mirrored on the client for defense in depth.
- **JWT auth** — short-lived access tokens (15 min) plus rotating refresh tokens, bcrypt-hashed passwords, per-account lockout, per-IP throttling.

### Attendance, leave, regularizations
- **Punch in / punch out** with daily projection (`attendance_daily`) derived from raw `attendance_logs`. Locked months are immutable; everything else is recomputable on read.
- **Leave** — admin-defined leave types, balances per employee per year, request → **approve / reject** state machine.
- **Regularizations** — employees raise corrections for missing or wrong punches; managers/admins decide.
- **Reject with reason** — when an admin rejects a leave or regularization, the platform requires a non-empty reason (2–500 chars) and surfaces it back to the employee on the same row.

### Payroll
- **Pay runs** flow through `DRAFT → REVIEW → APPROVED → LOCKED`. Locking snapshots attendance, salary, and LOP into immutable `payroll_details`.
- **Maker-checker** — `PAYROLL_REQUIRE_SEPARATE_APPROVER` enforces that a run is approved by a different user than its creator. Lock is super-admin only.
- **Salary components** — reusable catalogue with `FIXED`, `PERCENT_OF_BASIC`, and `PERCENT_OF_CTC` calculations; LOP prorating handled automatically.
- **Salary templates** — build a CTC structure once, apply to any new hire.
- **Payslips** — rendered as styled HTML and (when WeasyPrint deps are present) downloadable PDF.

### Settings (Zoho-style)
A six-module Settings area, exclusively for admins:

| Module | What it does |
|---|---|
| **Organisation Profile** | Company identity, address, locale, currency, **company logo upload** (inline base64, ≤ 1 MB). |
| **Work Locations** | Multi-office support with primary-location toggle. |
| **Salary Components** | Earnings / deductions / reimbursements with EPF/ESI flags. |
| **Salary Templates** | Reusable CTC blueprints with live calculation preview. |
| **Pay Schedule** | Work-week, payroll basis (actual / org-days), pay-day, first payroll month — with a live calendar. |
| **Users & Roles** | Invite users, activate / deactivate, view role capability cards. |

### Reporting & audit
- Excel reports for **attendance**, **leaves**, **payroll**, and **employees**.
- **Append-only audit log** — every sensitive mutation writes `(actor, action, entity, before, after, ip, request_id)`.
- Admin **Audit Logs** page with filtering and pagination.

### UI / UX
- **Zoho-Payroll-style design language** — dark navy command rail, Zoho-blue accents, lavender top bar, soft cards, slim stacked bar charts.
- **Single-screen dashboards** — admin's Process-Pay-Run hero card, payroll/employee summaries, 12-month payroll cost chart with hover breakdown.
- **Settings shell** — when the user enters `/settings/*`, the navy nav cleanly swaps for the settings rail (no double sidebars).
- **Role-aware navigation** — admins see Pay Runs / Approvals / Reports; employees see Attendance / Leaves / Payslips / Holidays.

---

## Screenshots

> Captured straight from the running app via Playwright. Full-resolution copies live in [`docs/screenshots/`](docs/screenshots).

### Login & dashboards

| Login | Admin Dashboard |
|:---:|:---:|
| ![Login](docs/screenshots/01-login.png) | ![Admin Dashboard](docs/screenshots/02-admin-dashboard.png) |
| **Employee Dashboard** | **Employees** |
| ![Employee Dashboard](docs/screenshots/03-employee-dashboard.png) | ![Employees](docs/screenshots/04-employees.png) |

### Approvals & payroll

| Leaves (Admin) | Payroll |
|:---:|:---:|
| ![Admin Leaves](docs/screenshots/05-admin-leaves.png) | ![Payroll](docs/screenshots/06-payroll.png) |

### Settings (Zoho-style)

| Organisation Profile | Pay Schedule |
|:---:|:---:|
| ![Settings — Organisation](docs/screenshots/07-settings-organisation.png) | ![Settings — Pay Schedule](docs/screenshots/08-settings-pay-schedule.png) |
| **Salary Templates** | **Audit Logs** |
| ![Settings — Salary Templates](docs/screenshots/09-settings-salary-templates.png) | ![Audit Logs](docs/screenshots/10-audit-logs.png) |

### Employee self-service

| Payslips | Attendance |
|:---:|:---:|
| ![Employee Payslips](docs/screenshots/11-employee-payslips.png) | ![Employee Attendance](docs/screenshots/12-employee-attendance.png) |

---

## Tech stack

| Layer    | Tooling |
|----------|---------|
| **Frontend** | React 18, TypeScript (strict), Vite, Tailwind CSS, shadcn-style primitives on Radix UI, TanStack Query, React Hook Form, Zod, Recharts, Zustand, Sonner, lucide-react |
| **Backend**  | FastAPI 0.111, SQLAlchemy 2.0, Alembic, Pydantic v2, python-jose (JWT), passlib + bcrypt, WeasyPrint, openpyxl |
| **Database** | PostgreSQL 15+ (production) · SQLite (zero-setup dev) |
| **Auth**     | JWT access + rotating refresh tokens, bcrypt password hashing, per-account lockout, per-IP throttle |
| **Storage**  | Local filesystem → S3-compatible interface (boto3) for payslips & exports |
| **Email**    | SMTP (Gmail App Password / SendGrid / SES) or console backend for dev |

---

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser SPA (React)                        │
│  TanStack Query · React Hook Form · Zod · Tailwind · Radix UI    │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTPS · JSON · JWT
┌─────────────────────────────▼───────────────────────────────────┐
│                        FastAPI (ASGI)                             │
│   api/  →  services/  →  models/  →  PostgreSQL / SQLite        │
│              ↑                                                   │
│              └── schemas/ (Pydantic DTOs, request + response)    │
│   core/ : config · security · deps (RBAC) · audit · storage     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                ┌─────────────┴────────────┐
                ▼                          ▼
        File storage              Email service
        (local → S3)              (console / SMTP)
```

- **api/** — thin HTTP layer. Validates input, enforces RBAC, delegates. No business logic.
- **services/** — all business rules (payroll computation, attendance derivation, leave balances, approval state machines).
- **models/** — SQLAlchemy ORM = the database tables.
- **schemas/** — Pydantic DTOs. ORM models are never returned directly.
- **core/** — cross-cutting concerns: config, db session, security, RBAC deps, audit, storage, pagination.

For more depth, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/DATABASE.md`](docs/DATABASE.md).

---

## Quick start

> **Prerequisites:** Python 3.11+, Node 20+, PostgreSQL 15+ (optional — SQLite works for dev).

### 1 · Backend

```powershell
# From the repo root — `.env` lives here, alongside README and LICENSE.
copy .env.example .env                # macOS/Linux: cp .env.example .env

cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# Apply schema (PostgreSQL). Skip on SQLite — tables auto-create on startup.
alembic upgrade head

# Start the API. Roles + the super-admin user bootstrap automatically on startup.
uvicorn app.main:app --reload
# → http://localhost:8000   (OpenAPI docs at /docs)
```

### 2 · Frontend

```powershell
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:8000`.

### 3 · Sign in

Use `admin@company.com` / `Admin@12345` (the bootstrapped super-admin, configurable in `.env`), or have employees register themselves at `/signup`.

---

## Default logins

| Email | Password | Role |
|---|---|---|
| `admin@company.com` | `Admin@12345` | Super Admin |

The product surfaces only **Admin** and **Employee** in the UI. The 4-tier RBAC enum (`EMPLOYEE < MANAGER < HR_ADMIN < SUPER_ADMIN`) lives in the model and route guards if you ever want a middle approver layer.

> **Always change the bootstrap password before exposing the app outside localhost.**

---

## Configuration

All configuration lives in a single `.env` at the **repo root** (loaded automatically no matter which directory you launch `uvicorn` from). Highlights:

```ini
# App
APP_NAME="Payroll"
ENVIRONMENT=development                     # production triggers strict guard rails
API_V1_PREFIX=/api/v1
BACKEND_CORS_ORIGINS=["http://localhost:5173"]

# Database — SQLite for dev, Postgres for prod
DATABASE_URL=sqlite:///./hrms.db
# DATABASE_URL=postgresql+psycopg2://hrms:hrms@localhost:5432/hrms

# Security
SECRET_KEY=change_me                        # python -c "import secrets; print(secrets.token_urlsafe(48))"
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
ACCOUNT_LOCKOUT_THRESHOLD=8
ACCOUNT_LOCKOUT_MINUTES=15

# Email (set EMAIL_BACKEND=smtp + SMTP_* to send real emails)
EMAIL_BACKEND=console                       # console | smtp
SMTP_HOST=smtp.gmail.com
SMTP_USERNAME=
SMTP_PASSWORD=                              # Gmail: use an *App Password*, not your account password
SMTP_USE_TLS=true

# Bootstrap
FIRST_SUPERADMIN_EMAIL=admin@company.com
FIRST_SUPERADMIN_PASSWORD=Admin@12345
AUTO_BOOTSTRAP_ON_STARTUP=true              # idempotent — safe to leave on

# Company-domain allow-list (optional, recommended for production)
# Restricts signup, login, admin-invite and admin-create-employee to addresses
# ending in one of these domains. Empty = no restriction.
# ALLOWED_EMAIL_DOMAINS=yanthraa.com
# ALLOWED_EMAIL_DOMAINS=yanthraa.com,yanthraa.in

# Payroll policy
PAYROLL_REQUIRE_SEPARATE_APPROVER=true      # maker-checker
WORKDAY_START="09:30"
FULL_DAY_MINUTES=480
HALF_DAY_MINUTES=240
WEEKEND_DAYS=[5,6]                          # Sat, Sun (Mon=0)
```

See [`.env.example`](.env.example) for the full surface, including S3 storage and account-lockout knobs.

---

## API surface (v1)

All endpoints live under `/api/v1`. OpenAPI is auto-generated at `/docs`.

```
auth           POST  /auth/signup · /auth/login · /auth/refresh · /auth/logout · /auth/change-password
               GET   /auth/me
employees      GET   POST   PATCH  /employees · /employees/{id}
               POST  /employees/{id}/activate · /deactivate
               PUT   /employees/{id}/profile · /salary-structure
attendance     POST  /attendance/punch
               GET   /attendance/today · /month · /summary · /logs
leaves         GET   POST   /leaves/types
               PATCH DELETE /leaves/types/{id}
               GET   /leaves/balances · /leaves/requests
               POST  /leaves/requests · /leaves/requests/{id}/approve|reject|cancel
regularizations GET  POST  /regularizations
               POST  /regularizations/{id}/approve|reject
holidays       GET POST PATCH DELETE  /holidays
salary         GET POST PATCH         /salary-structures
payroll        POST  /payroll/runs
               POST  /payroll/runs/{id}/submit|approve|lock|reopen|recompute
               GET   /payroll/payslips/me
               GET   /payroll/payslips/detail/{id}/download
reports        GET   /reports/(attendance|leaves|payroll|employees)        (Excel)
audit          GET   /audit-logs
dashboard      GET   /dashboard/admin · /dashboard/me
settings       GET   PUT     /settings/organisation
               POST  DELETE  /settings/organisation/logo
               GET            /settings/organisation/branding              (any authenticated user)
               GET POST PATCH DELETE  /settings/work-locations
               GET POST PATCH DELETE  /settings/salary-components
               GET POST PATCH DELETE  /settings/salary-templates
               GET PUT                /settings/pay-schedule
               GET                    /settings/users · /settings/roles
               POST                   /settings/users/invite · /activate · /deactivate
```

Reject endpoints (`/leaves/requests/{id}/reject`, `/regularizations/{id}/reject`) require a non-empty `decision_note` and return HTTP 422 otherwise.

---

## Project structure

```
backend/
├─ alembic/                        Migrations — initial + lockout + settings + logo
├─ app/
│  ├─ api/v1/                      Thin HTTP layer — one router per domain
│  │   auth · employees · attendance · leaves · regularizations · holidays
│  │   salary · payroll · reports · audit · dashboard · settings
│  ├─ core/                        config · database · security · deps (RBAC)
│  │                               audit · storage · pagination · exceptions · logging
│  ├─ models/                      SQLAlchemy ORM = database tables
│  ├─ schemas/                     Pydantic DTOs (request + response)
│  ├─ services/                    Business logic — never imported into models
│  ├─ main.py                      FastAPI app factory
│  └─ seed.py                      Idempotent bootstrap (roles + super admin)
├─ tests/                          pytest fixtures + integration tests
├─ requirements.txt
└─ .env.example

frontend/
├─ src/
│  ├─ components/
│  │   app-layout.tsx              Navy sidebar + top bar + settings shell switch
│  │   brand.tsx                   Org branding hook + brand mark
│  │   reject-reason-dialog.tsx    Reusable reject-with-reason dialog
│  │   auth-guard.tsx              Route + role guards
│  │   ui/                         shadcn-style primitives (button, dialog, table, …)
│  ├─ lib/                         Axios client, formatters, utils
│  ├─ pages/
│  │   Login · Signup · Dashboard · Employees · EmployeeDetail
│  │   Attendance · Leaves · LeaveTypes · Regularizations
│  │   Holidays · Payroll · PayrollRun · Payslips · Reports · AuditLogs · Profile
│  │   settings/  Organisation · WorkLocations · SalaryComponents
│  │              SalaryTemplates · PaySchedule · UsersRoles
│  ├─ stores/auth.ts               Zustand auth store with persistence
│  ├─ styles/globals.css           Tailwind layers + design tokens
│  ├─ types/api.ts                 TypeScript mirrors of backend Pydantic schemas
│  ├─ App.tsx                      Router
│  └─ main.tsx                     Entry point (QueryClient + Router + Toaster)
├─ tailwind.config.ts · vite.config.ts · tsconfig.json · package.json
└─ index.html

docs/
├─ ARCHITECTURE.md                 System design, layering, key domain decisions
└─ DATABASE.md                     Schema + indexing strategy
```

---

## Production checklist

These are baked in but worth surfacing before you go live.

- [ ] Set `ENVIRONMENT=production`. The app **refuses to boot** on a default/short `SECRET_KEY`, a SQLite `DATABASE_URL`, a CORS `*`, or the default admin password.
- [ ] Generate a fresh `SECRET_KEY` (`python -c "import secrets; print(secrets.token_urlsafe(48))"`).
- [ ] Switch `DATABASE_URL` to PostgreSQL and run `alembic upgrade head`.
- [ ] Switch `EMAIL_BACKEND=smtp` and configure SMTP (Gmail needs an **App Password**, not your account password).
- [ ] Lock down `BACKEND_CORS_ORIGINS` to your real frontend origin(s). No wildcards.
- [ ] Rotate the bootstrap admin password from the UI immediately after first login.
- [ ] Provision storage: keep `STORAGE_BACKEND=local` for single-node, switch to `s3` and fill `S3_*` for multi-node.
- [ ] Put the API behind HTTPS with a real certificate. The CORS layer expects HTTPS in production.
- [ ] (Recommended) Run the audit-log table under a DB role that has no UPDATE/DELETE rights — append-only at the storage layer too.
- [ ] (Recommended) Schedule daily `pg_dump` backups of the payroll DB and keep at least 30 days of retention.

---

## Tests & quality gates

```powershell
# Backend
cd backend
pytest                                # auth, employees, attendance, leave,
                                      # payroll lifecycle, security (password policy,
                                      # account lockout, payroll maker-checker)

# Frontend
cd frontend
npm run typecheck                     # tsc --noEmit
npm run lint                          # eslint, --max-warnings 0
npm run build                         # tsc -b && vite build
```

The frontend ships with Playwright screenshot harnesses (`_qa_shot.mjs`, `_qa_clickshot.mjs`, `_qa_template.mjs`) used during development for visual regressions across roles and routes.

---

## Notes & tradeoffs

- **WeasyPrint on Windows** — generating payslip PDFs requires the GTK runtime. If unavailable, the system falls back to streaming the payslip as styled HTML (still printable). On Linux the WeasyPrint deps are typically already present; see <https://doc.courtbouillon.org/weasyprint>.
- **Attendance is derived, not stored as truth.** Raw `attendance_logs` are immutable; the per-day `attendance_daily` projection is recomputable on read. Punches and approvals trigger a recompute. Locked payroll months are immune.
- **Payroll lock = immutability.** Once a run is locked, attendance/leave edits for that month cannot change the finalized numbers — the snapshot in `payroll_details` is the source of truth for payslips.
- **Audit logs never expose UPDATE / DELETE endpoints.** Revoking those grants at the DB level is recommended in production.
- **Org logo** is stored as a base64 data URL on the singleton `organization_profile` row (≤ 1 MB) — keeps payslips fully self-contained without a separate static-asset host.

---

## License

Released under the [MIT License](LICENSE) — free to use, modify, and distribute, with no warranty. If you build something cool on top of it, a star or a shout-out is appreciated but not required.
