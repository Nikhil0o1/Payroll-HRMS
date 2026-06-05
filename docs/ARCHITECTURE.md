# HRMS + Payroll — System Architecture

A focused, production-grade HRMS + Payroll platform. Not an ERP, not an all-in-one suite.

## 1. High-level architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         Browser (SPA)                          │
│   React + TS + Vite + Tailwind + shadcn/ui + React Query       │
│   + React Hook Form + Zod                                      │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTPS / JSON (JWT access token)
┌───────────────────────────▼──────────────────────────────────┐
│                       FastAPI (ASGI)                           │
│  ┌──────────┬──────────────┬──────────────┬────────────────┐  │
│  │  Auth/   │  API Routers │  Services /  │  Audit / RBAC   │  │
│  │  JWT     │  (v1)        │  Domain      │  middleware     │  │
│  └──────────┴──────────────┴──────────────┴────────────────┘  │
│  SQLAlchemy ORM  ·  Alembic migrations  ·  Pydantic schemas   │
└───────────────────────────┬──────────────────────────────────┘
                            │
        ┌───────────────────┼────────────────────┐
        ▼                   ▼                    ▼
   PostgreSQL          File storage          Background tasks
   (SQLite for dev)    (local → S3 iface)    (report exports,
                                              payslip PDFs)
```

## 2. Layering (backend)

The backend follows a clean, layered architecture. Dependencies point inward.

```
api (routers)  ->  services (business logic)  ->  models (ORM)  ->  db
       \                  |                              ^
        \-> schemas (Pydantic, request/response) <-------/
```

- **api/** — thin HTTP layer. Validates input via schemas, enforces RBAC via deps, delegates to services. No business logic.
- **services/** — all business rules (payroll computation, attendance derivation, leave balance, approval state machines). Pure-ish, testable.
- **models/** — SQLAlchemy ORM models = the database tables.
- **schemas/** — Pydantic DTOs for request/response. Never expose ORM models directly.
- **core/** — cross-cutting: config, db session, security, RBAC deps, audit, storage, pagination.

### SOLID / clean-code mapping
- **S** — each service owns one domain (PayrollService, AttendanceService…).
- **O** — leave types, salary components, holiday types are data-driven, extendable without code change.
- **L/I** — storage backend is an interface (`Storage`), Local + S3 implementations are swappable.
- **D** — routers depend on service abstractions and injected DB sessions, not concretes.

## 3. Key domain decisions

### Attendance is derived, never stored as truth
- `attendance_logs` holds **raw immutable punch events** (`IN`/`OUT`, timestamp).
- `attendance_daily` is a **derived projection** (working hours, late, missing punch, status) computed from logs + holidays + leave. It is a cache/snapshot that can always be recomputed — except when frozen by payroll.

### Payroll locking = immutability
- A `payroll_run` for a month moves through `DRAFT → REVIEW → APPROVED → LOCKED`.
- On **LOCK**, the run snapshots every input (attendance summary, salary structure, leave) into `payroll_details`. After locking, attendance/leave edits for that month **cannot** change the finalized numbers — the snapshot is the source of truth for payslips.
- Locked runs are immutable; corrections require an explicit (audited) unlock by Super Admin or an off-cycle adjustment run.

### Audit logs are append-only
- Every mutating, sensitive action writes an `audit_logs` row (actor, action, entity, entity_id, before, after, ts, ip).
- No update/delete API exists for audit rows; DB-level we recommend revoking UPDATE/DELETE for the app role.

## 4. RBAC model

Roles: `EMPLOYEE < MANAGER < HR_ADMIN < SUPER_ADMIN` (hierarchical for convenience, but checks are explicit per endpoint).

- Enforced on the **backend** via FastAPI dependencies (`require_roles(...)`, `require_self_or_roles(...)`).
- Enforced on the **frontend** via route guards + conditional UI (defense in depth; backend is authoritative).
- Managers act on their **direct reports** only (scoped queries); HR/Super Admin act org-wide.

## 5. Authentication flow

1. `POST /auth/login` → returns short-lived **access token** (JWT, ~15 min) + sets long-lived **refresh token** (rotating).
2. SPA stores access token in memory; refresh token in an httpOnly-style flow (here: stored + sent to `/auth/refresh`).
3. `POST /auth/refresh` rotates the refresh token (old one revoked) and issues a new access token.
4. `POST /auth/logout` revokes the refresh token.
5. Passwords hashed with bcrypt. Tokens signed HS256 (swap to RS256 for multi-service).

## 6. Storage abstraction

`Storage` interface with `save`, `get_url`, `open`. `LocalStorage` writes under `STORAGE_DIR`; `S3Storage` (boto3) is drop-in via config. Payslip PDFs and report exports go through it.

## 7. Background work

Export reports and payslip PDFs run as FastAPI `BackgroundTasks` (single-node). The job interface is written so it can move to Celery/RQ + Redis without touching call sites.

## 8. Non-functional

- Pagination + filtering on all list endpoints (`?page=&size=&q=&...`).
- Structured logging, request IDs, global exception handlers returning consistent error envelopes.
- Indexed foreign keys + composite indexes on hot paths (employee_id+timestamp, run+employee).
- OpenAPI docs auto-served at `/docs`.

## 9. Tech stack

| Layer    | Tech |
|----------|------|
| Frontend | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Query, React Hook Form, Zod |
| Backend  | FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2 |
| DB       | PostgreSQL (SQLite for zero-setup dev) |
| Auth     | JWT access + rotating refresh tokens, bcrypt |
| Storage  | Local FS → S3-compatible interface |
| PDF      | WeasyPrint |

See `DATABASE.md` for the schema and `API.md` for endpoints.
