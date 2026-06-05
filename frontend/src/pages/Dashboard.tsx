import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  Clock,
  Coins,
  History,
  Info,
  LogIn,
  LogOut,
  Receipt,
  ReceiptText,
  Sparkles,
  TimerReset,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StackedBars } from "@/components/ui/charts";
import { AttendanceBadge } from "@/components/status-badge";
import { api, apiErrorMessage } from "@/lib/api";
import { cn, formatCurrency, minutesToHours, monthLabel } from "@/lib/utils";
import { rolesAtLeast, useAuthStore } from "@/stores/auth";
import { useOrgBranding } from "@/components/brand";
import type { AdminMetrics, AttendanceSummary, EmployeeDashboardData, PayrollCostPoint } from "@/types/api";

const ORG_NAME = "your organisation";

export function DashboardPage() {
  const me = useAuthStore((s) => s.me);
  const isAdmin = rolesAtLeast(me?.role, "HR_ADMIN");

  if (isAdmin) return <AdminDashboard />;
  if (me?.employee) return <EmployeeDashboard />;
  return (
    <div className="grid place-items-center min-h-[60vh]">
      <EmptyState
        icon={Clock}
        title="No employee record linked"
        description="Your account isn't linked to an employee profile yet. Contact your HR admin."
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// EMPLOYEE — single-screen, dense, no scrolling.
// ────────────────────────────────────────────────────────────────────────────
function EmployeeDashboard() {
  const me = useAuthStore((s) => s.me);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-4">
      {/* Compact header — single line */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {greet}, {me?.employee?.first_name ?? me?.email?.split("@")[0]}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, d MMMM yyyy")}
          </p>
        </div>
        <span className="hidden sm:inline-flex text-xs text-muted-foreground tabular">
          Week {format(new Date(), "w")} · {format(new Date(), "yyyy")}
        </span>
      </div>

      {/* Row 1 — Hero punch + month summary */}
      <div className="grid gap-4 lg:grid-cols-3">
        <PunchCard className="lg:col-span-2" />
        <MonthSummaryCard />
      </div>

      {/* Row 2 — Leave / Holidays / Quick actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <LeaveBalanceCard />
        <UpcomingHolidaysCard />
        <QuickActionsCard />
      </div>
    </div>
  );
}

function PunchCard({ className }: { className?: string }) {
  const me = useAuthStore((s) => s.me);
  const qc = useQueryClient();

  const today = useQuery({
    queryKey: ["attendance", "today"],
    queryFn: async () =>
      (await api.get("/attendance/today")).data as EmployeeDashboardData["today_status"],
    enabled: !!me?.employee,
    refetchInterval: 60_000,
  });

  const punch = useMutation({
    mutationFn: async (type: "IN" | "OUT") => (await api.post("/attendance/punch", { type })).data,
    onSuccess: (_d, type) => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Punched ${type}`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const status = today.data;
  const isPunchedIn = !!status?.is_punched_in;

  return (
    <Card className={className}>
      <div className="p-5 grid sm:grid-cols-[1fr_auto] gap-5 items-center">
        <div className="space-y-3 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              Today
            </span>
            {status ? <AttendanceBadge status={status.status} /> : null}
            {isPunchedIn ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                On the clock
              </span>
            ) : null}
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-[34px] leading-none font-semibold tabular tracking-tight">
              {status ? minutesToHours(status.worked_minutes) : "—"}
            </span>
            <span className="text-sm text-muted-foreground">worked</span>
          </div>
          <div className="flex items-center gap-5 text-xs">
            <PunchStat label="First in" value={status?.first_in} />
            <span className="h-3 w-px bg-border" />
            <PunchStat label="Last out" value={status?.last_out} />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:min-w-[180px]">
          {isPunchedIn ? (
            <Button
              variant="destructive"
              size="lg"
              onClick={() => punch.mutate("OUT")}
              loading={punch.isPending}
            >
              <LogOut className="h-4 w-4" /> Punch out
            </Button>
          ) : (
            <Button size="lg" onClick={() => punch.mutate("IN")} loading={punch.isPending}>
              <LogIn className="h-4 w-4" /> Punch in
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to="/attendance">View attendance</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PunchStat({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-1.5 font-semibold tabular text-foreground">
        {value ? format(parseISO(value), "HH:mm") : "—"}
      </span>
    </div>
  );
}

function MonthSummaryCard() {
  const me = useAuthStore((s) => s.me);
  const today = new Date();
  const period_start = format(startOfMonth(today), "yyyy-MM-dd");
  const period_end = format(endOfMonth(today), "yyyy-MM-dd");

  const q = useQuery({
    queryKey: ["attendance", "summary", me?.employee?.id, period_start],
    queryFn: async () =>
      (
        await api.get<AttendanceSummary>("/attendance/summary", {
          params: { period_start, period_end, employee_id: me?.employee?.id },
        })
      ).data,
    enabled: !!me?.employee,
  });

  const s = q.data;
  const monthLabel = format(today, "MMMM");
  const totalWorkdays =
    (s?.present_days ?? 0) + (s?.absent_days ?? 0) + (s?.half_days ?? 0) + (s?.leave_days ?? 0);
  // Working days in month = total calendar days - weekends - holidays.
  const workingDaysInMonth = Math.max(
    1,
    differenceInCalendarDays(endOfMonth(today), startOfMonth(today)) +
      1 -
      (s?.weekend_count ?? 0) -
      (s?.holiday_count ?? 0),
  );
  const completedPct = Math.min(
    100,
    Math.round((((s?.present_days ?? 0) + (s?.half_days ?? 0) * 0.5) / workingDaysInMonth) * 100),
  );

  return (
    <Card className="overflow-hidden">
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              {monthLabel}
            </p>
            <p className="text-sm font-semibold mt-0.5">This month at a glance</p>
          </div>
          <TimerReset className="h-4 w-4 text-muted-foreground" />
        </div>

        {q.isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular leading-none">
                  {minutesToHours(s?.total_worked_minutes ?? 0)}
                </span>
                <span className="text-xs text-muted-foreground tabular">
                  {((s?.present_days ?? 0) + (s?.half_days ?? 0) * 0.5).toFixed(1)} / {workingDaysInMonth} d
                </span>
              </div>
              <Progress value={completedPct} />
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 border-t -mx-1 px-1">
              <MiniStat label="Late" value={s?.late_count ?? 0} />
              <MiniStat label="Half-days" value={s?.half_days ?? 0} />
              <MiniStat label="Missing" value={s?.missing_punch_count ?? 0} />
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center pt-2">
      <div className="text-base font-semibold tabular leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function LeaveBalanceCard() {
  const me = useAuthStore((s) => s.me);
  const q = useQuery({
    queryKey: ["leaves", "balances"],
    queryFn: async () =>
      (await api.get("/leaves/balances")).data as Array<{
        leave_type_id: number;
        leave_type?: { id: number; code: string; name: string; color?: string };
        allotted: number;
        used: number;
        pending: number;
        available: number;
      }>,
    enabled: !!me?.employee,
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-sm">Leave balance</CardTitle>
          <CardDescription className="text-xs">{new Date().getFullYear()} entitlement</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild className="h-7 -mr-2">
          <Link to="/leaves" className="text-xs">
            Apply <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <Skeleton className="h-20" />
        ) : (q.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No leave types configured.</p>
        ) : (
          q.data!.slice(0, 3).map((b) => {
            const total = b.allotted || 1;
            const usedPct = Math.min(100, Math.round(((b.used + b.pending) / total) * 100));
            return (
              <div key={b.leave_type_id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">{b.leave_type?.name ?? b.leave_type?.code}</span>
                  <span className="tabular shrink-0">
                    <span className="font-semibold">{b.available}</span>
                    <span className="text-muted-foreground"> / {b.allotted}</span>
                  </span>
                </div>
                <Progress value={usedPct} color={b.leave_type?.color || undefined} className="h-1.5" />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingHolidaysCard() {
  const q = useQuery({
    queryKey: ["holidays", "list"],
    queryFn: async () =>
      (await api.get("/holidays")).data as Array<{ id: number; name: string; date: string; type: string }>,
  });
  const upcoming = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (q.data ?? []).filter((h) => parseISO(h.date) >= today).slice(0, 3);
  }, [q.data]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Upcoming holidays</CardTitle>
        <CardDescription className="text-xs">Plan ahead</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Skeleton className="h-20" />
        ) : upcoming.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <CalendarDays className="h-4 w-4" />
            None scheduled
          </div>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((h) => {
              const d = parseISO(h.date);
              const days = Math.max(0, differenceInCalendarDays(d, new Date()));
              return (
                <li key={h.id} className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-primary/8 text-primary grid place-items-center shrink-0">
                    <div className="text-center leading-none">
                      <div className="text-[9px] uppercase">{format(d, "MMM")}</div>
                      <div className="text-xs font-bold">{format(d, "d")}</div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{h.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {format(d, "EEE")} · {days === 0 ? "today" : `in ${days}d`}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActionsCard() {
  const actions = [
    { to: "/leaves", label: "Apply leave", icon: CalendarCheck2 },
    { to: "/regularizations", label: "Regularize", icon: History },
    { to: "/payslips", label: "Payslips", icon: ReceiptText },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Quick actions</CardTitle>
        <CardDescription className="text-xs">Common requests</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {actions.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium hover:bg-muted transition-colors group"
          >
            <span className="h-7 w-7 rounded-md bg-muted grid place-items-center text-muted-foreground group-hover:bg-primary/12 group-hover:text-primary transition-colors">
              <a.icon className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 text-xs">{a.label}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ADMIN — Zoho-style home
// ────────────────────────────────────────────────────────────────────────────
function AdminDashboard() {
  const q = useQuery({
    queryKey: ["dashboard", "admin"],
    queryFn: async () => (await api.get<AdminMetrics>("/dashboard/admin")).data,
  });
  const m = q.data;
  const loading = q.isLoading;
  const orgName = useOrgBranding().data?.name ?? ORG_NAME;

  // Single-screen layout: everything fits above the fold, no page scroll.
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Welcome to {orgName}!</h1>
        <p className="hidden text-xs text-muted-foreground sm:block">
          {format(new Date(), "EEEE, d MMMM yyyy")}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ProcessPayRunCard m={m} loading={loading} />
          <div className="grid gap-4 sm:grid-cols-3">
            <PayrollSummaryPanel m={m} loading={loading} className="sm:col-span-2" />
            <EmployeeSummaryCard m={m} loading={loading} />
          </div>
          <PayrollCostCard m={m} loading={loading} />
        </div>
        <aside>
          <ToDoTasksCard m={m} loading={loading} />
        </aside>
      </div>
    </div>
  );
}

function StatusPill({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "success" | "warning" }) {
  const cls = {
    info: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
  }[tone];
  return (
    <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", cls)}>
      {children}
    </span>
  );
}

function ProcessPayRunCard({ m, loading }: { m?: AdminMetrics; loading: boolean }) {
  if (loading || !m?.current_run) {
    return <Skeleton className="h-[132px] rounded-lg" />;
  }
  const run = m.current_run;
  const period = monthLabel(run.period_year, run.period_month);
  const paymentDate = format(endOfMonth(new Date(run.period_year, run.period_month - 1, 1)), "dd/MM/yyyy");
  const hasRun = !!run.id;
  const locked = run.status === "LOCKED";
  const tone = !hasRun ? "info" : locked ? "success" : "warning";

  return (
    <Card className="overflow-hidden">
      <div className="border-l-[3px] border-primary p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-sm font-semibold">
            Process Pay Run for <span className="text-foreground">{period}</span>
          </h2>
          <StatusPill tone={tone}>{hasRun ? (run.status ?? "Draft") : "Ready"}</StatusPill>
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center">
          <Field label="Employees' Net Pay">
            {hasRun ? (
              <span className="text-lg font-semibold tabular">{formatCurrency(run.total_net, m.currency)}</span>
            ) : (
              <span className="inline-block rounded bg-muted px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Yet to process
              </span>
            )}
          </Field>
          <Field label="Payment Date">
            <span className="text-base font-semibold tabular">{paymentDate}</span>
          </Field>
          <Field label="No. of Employees">
            <span className="text-base font-semibold tabular">{run.employee_count}</span>
          </Field>
          <Button asChild>
            {hasRun ? (
              <Link to={`/payroll/runs/${run.id}`}>Open Pay Run</Link>
            ) : (
              <Link to="/payroll">Create Pay Run</Link>
            )}
          </Button>
        </div>

        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          {locked
            ? "This pay run is locked and finalised."
            : hasRun
              ? "This pay run has been created — review and approve it."
              : "You haven't processed this pay run yet."}
        </p>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function MoneyTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "primary" | "success" | "warning";
}) {
  const ring = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
  }[tone];
  return (
    <div className="rounded-lg border border-border p-3">
      <span className={cn("grid h-8 w-8 place-items-center rounded-lg", ring)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular">{value}</div>
    </div>
  );
}

function PayrollSummaryPanel({ m, loading, className }: { m?: AdminMetrics; loading: boolean; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2 pt-4">
        <CardTitle className="text-[15px]">Payroll Summary</CardTitle>
        <span className="text-xs text-muted-foreground">This year</span>
      </CardHeader>
      <CardContent className="pb-4">
        {loading || !m ? (
          <Skeleton className="h-[92px]" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            <MoneyTile icon={Wallet} label="Gross" value={formatCurrency(m.ytd_gross ?? 0, m.currency)} tone="primary" />
            <MoneyTile icon={Receipt} label="Deductions" value={formatCurrency(m.ytd_deductions ?? 0, m.currency)} tone="warning" />
            <MoneyTile icon={Coins} label="Net Pay" value={formatCurrency(m.ytd_net ?? 0, m.currency)} tone="success" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmployeeSummaryCard({ m, loading }: { m?: AdminMetrics; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-[15px]">Employee Summary</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center pb-4 text-center">
        {loading || !m ? (
          <Skeleton className="h-16 w-24" />
        ) : (
          <>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Active Employees
            </div>
            <div className="my-0.5 text-3xl font-semibold tabular text-success">{m.active_employees}</div>
            <Link to="/employees" className="text-xs font-medium text-primary hover:underline">
              View Employees
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Net Pay (dark green) + deduction components in warm shades — our palette,
// multiple shades per bar (Zoho-style). Index 0 is always Net Pay.
const COST_SHADES = [
  "hsl(145 63% 33%)",
  "hsl(38 92% 52%)",
  "hsl(24 90% 55%)",
  "hsl(0 72% 58%)",
  "hsl(280 48% 58%)",
  "hsl(199 85% 46%)",
  "hsl(168 64% 38%)",
  "hsl(330 70% 56%)",
];

function PayrollCostCard({ m, loading }: { m?: AdminMetrics; loading: boolean }) {
  const q = useQuery({
    queryKey: ["dashboard", "payroll-cost"],
    queryFn: async () => (await api.get<PayrollCostPoint[]>("/dashboard/payroll-cost")).data,
  });
  const points = q.data ?? [];

  // Aggregate segment totals to order the stack (Net Pay first, then deductions
  // by size) and to detect whether there's anything to draw.
  const totalsByKey = new Map<string, number>();
  for (const p of points) {
    for (const [k, v] of Object.entries(p.segments ?? {})) {
      totalsByKey.set(k, (totalsByKey.get(k) ?? 0) + (v || 0));
    }
  }
  const dedKeys = [...totalsByKey.keys()]
    .filter((k) => k !== "Net Pay")
    .sort((a, b) => (totalsByKey.get(b) ?? 0) - (totalsByKey.get(a) ?? 0));
  const keys = [...(totalsByKey.has("Net Pay") ? ["Net Pay"] : []), ...dedKeys];

  const series = keys.map((k, i) => ({ key: k, name: k, color: COST_SHADES[i % COST_SHADES.length] }));
  const data = points.map((p) => {
    const row: Record<string, number | string> = { name: p.label.split(" ")[0] };
    for (const k of keys) row[k] = p.segments?.[k] ?? 0;
    return row;
  });

  const hasData = [...totalsByKey.values()].some((v) => v > 0);
  const yfmt = (v: number) =>
    v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : `${v}`;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-[15px]">Payroll Cost Summary</CardTitle>
        <span className="text-xs text-muted-foreground">This year</span>
      </CardHeader>
      <CardContent className="pt-0">
        {loading || q.isLoading ? (
          <Skeleton className="h-[160px]" />
        ) : (
          <>
            <StackedBars
              data={data}
              height={160}
              yFormatter={yfmt}
              valueFormatter={(v) => formatCurrency(v, m?.currency)}
              series={series.length ? series : [{ key: "Net Pay", name: "Net Pay", color: COST_SHADES[0] }]}
            />
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {series.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
              ))}
              {!hasData ? <span className="text-[11px]">No payroll has been processed yet.</span> : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ToDoTasksCard({ m, loading }: { m?: AdminMetrics; loading: boolean }) {
  const tasks: { label: string; to: string; icon: React.ComponentType<{ className?: string }> }[] = [];
  if (m) {
    if (m.pending_leave_approvals > 0)
      tasks.push({
        label: `${m.pending_leave_approvals} leave ${m.pending_leave_approvals === 1 ? "request" : "requests"} to review`,
        to: "/leaves",
        icon: CalendarCheck2,
      });
    if (m.pending_regularizations > 0)
      tasks.push({
        label: `${m.pending_regularizations} regularization ${m.pending_regularizations === 1 ? "request" : "requests"} to review`,
        to: "/regularizations",
        icon: History,
      });
    if (m.current_run && m.current_run.status && m.current_run.status !== "LOCKED")
      tasks.push({
        label: `Finish pay run for ${monthLabel(m.current_run.period_year, m.current_run.period_month)}`,
        to: m.current_run.id ? `/payroll/runs/${m.current_run.id}` : "/payroll",
        icon: Wallet,
      });
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">To Do Tasks</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40" />
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-success/10 text-success">
              <Sparkles className="h-6 w-6" />
            </span>
            <p className="mt-3 font-semibold">Time to celebrate!</p>
            <p className="mt-1 text-sm text-muted-foreground">You have no pending tasks.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {tasks.map((t) => (
              <li key={t.to + t.label}>
                <Link
                  to={t.to}
                  className="group flex items-center gap-3 rounded-md px-2 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
                    <t.icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 font-medium">{t.label}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
