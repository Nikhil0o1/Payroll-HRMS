import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  differenceInCalendarDays,
  endOfMonth,
  format,
  getDaysInMonth,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coffee,
  Coins,
  Download,
  History,
  Info,
  LogIn,
  LogOut,
  Megaphone,
  Plane,
  Receipt,
  ReceiptText,
  RefreshCw,
  Sparkles,
  TimerReset,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ColoredBars, StackedBars } from "@/components/ui/charts";
import { api, apiErrorMessage } from "@/lib/api";
import { cn, formatCurrency, formatISTTime, minutesToHours, monthLabel } from "@/lib/utils";
import { rolesAtLeast, useAuthStore } from "@/stores/auth";
import { useOrgBranding } from "@/components/brand";
import type {
  AdminMetrics,
  Announcement,
  AttendanceDaily,
  AttendanceSummary,
  Holiday,
  LatestPayslip,
  LeaveBalance,
  PayrollCostPoint,
  TodayStatus,
} from "@/types/api";

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
// EMPLOYEE — single-screen self-service home (fits one page, no scroll).
// ────────────────────────────────────────────────────────────────────────────
function EmployeeDashboard() {
  const me = useAuthStore((s) => s.me);
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const displayName = me?.employee
    ? `${me.employee.first_name} ${me.employee.last_name}`.trim()
    : me?.email?.split("@")[0];

  async function refresh() {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey[0];
          return (
            k === "attendance" ||
            k === "leaves" ||
            k === "holidays" ||
            k === "payslips" ||
            k === "announcements"
          );
        },
      });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Greeting */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {greet}, {displayName} <span className="align-middle">👋</span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {format(now, "EEEE, d MMMM yyyy")} · Week {format(now, "w")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Row 1 — status / today / month / leave */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AttendanceStatusCard />
        <TodayOverviewCard />
        <MonthSummaryCard />
        <LeaveBalanceCard />
      </div>

      {/* Row 2 — quick actions / holidays / payslip */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <QuickActionsCard />
        <UpcomingHolidaysCard />
        <LatestPayslipCard />
      </div>

      {/* Row 3 — attendance overview / announcements */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <AttendanceOverviewCard className="xl:col-span-2" />
        <AnnouncementsCard />
      </div>
    </div>
  );
}

/* ── shared bits ── */

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

function SectionLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
      {children} <ChevronRight className="h-3 w-3" />
    </Link>
  );
}

function useTodayStatus() {
  const me = useAuthStore((s) => s.me);
  return useQuery({
    queryKey: ["attendance", "today"],
    queryFn: async () => (await api.get<TodayStatus>("/attendance/today")).data,
    enabled: !!me?.employee,
    refetchInterval: 60_000,
  });
}

/* ── Card 1: Attendance status + punch ── */
function AttendanceStatusCard() {
  const qc = useQueryClient();
  const today = useTodayStatus();
  const status = today.data;
  const punchedIn = !!status?.is_punched_in;
  const hasIn = !!status?.first_in;
  const checkedOut = hasIn && !punchedIn;

  const punch = useMutation({
    mutationFn: async (type: "IN" | "OUT") => (await api.post("/attendance/punch", { type })).data,
    onSuccess: (_d, type) => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      toast.success(`Punched ${type.toLowerCase()}`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const headline = punchedIn ? "Checked in" : checkedOut ? "Checked out" : "Not checked in";
  const sub = punchedIn
    ? `since ${formatISTTime(status?.first_in)}`
    : checkedOut
      ? `at ${formatISTTime(status?.last_out)}`
      : "Punch in to start your day";

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-center justify-between">
        <CardLabel>Attendance status</CardLabel>
        {hasIn ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              status?.is_late ? "bg-warning/15 text-warning" : "bg-success/12 text-success",
            )}
          >
            {status?.is_late ? "Late" : "On time"}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            punchedIn ? "bg-success animate-pulse" : checkedOut ? "bg-muted-foreground" : "bg-border",
          )}
        />
        <span className="text-lg font-semibold tracking-tight">{headline}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>

      <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
        <span className="text-xs text-muted-foreground">Working hours today</span>
        <span className="text-sm font-semibold tabular-nums">
          {today.isLoading ? "—" : minutesToHours(status?.worked_minutes ?? 0)}
        </span>
      </div>

      <Button
        className="mt-3 w-full"
        loading={punch.isPending}
        onClick={() => punch.mutate(punchedIn ? "OUT" : "IN")}
      >
        {punchedIn ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
        {punchedIn ? "Punch out" : "Punch in"}
      </Button>
    </Card>
  );
}

/* ── Card 2: Today's overview ── */
function TodayOverviewCard() {
  const today = useTodayStatus();
  const s = today.data;
  const rows = [
    { icon: LogIn, label: "First in", value: formatISTTime(s?.first_in) },
    { icon: LogOut, label: "Last out", value: formatISTTime(s?.last_out) },
    { icon: Coffee, label: "Break", value: "—" },
    {
      icon: Clock,
      label: "Total hours",
      value: s?.last_out ? minutesToHours(s?.worked_minutes ?? 0) : "—",
    },
  ];
  return (
    <Card className="flex flex-col p-4">
      <CardLabel>Today's overview</CardLabel>
      <div className="mt-3 flex-1 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <r.icon className="h-4 w-4" />
              {r.label}
            </span>
            <span className="text-sm font-medium tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── Card 3: This month summary ── */
function MonthSummaryCard() {
  const me = useAuthStore((s) => s.me);
  const now = new Date();
  const period_start = format(startOfMonth(now), "yyyy-MM-dd");
  const period_end = format(endOfMonth(now), "yyyy-MM-dd");

  const summary = useQuery({
    queryKey: ["attendance", "summary", me?.employee?.id, period_start],
    queryFn: async () =>
      (
        await api.get<AttendanceSummary>("/attendance/summary", {
          params: { period_start, period_end, employee_id: me?.employee?.id },
        })
      ).data,
    enabled: !!me?.employee,
  });
  const holidays = useHolidays();

  const s = summary.data;
  const holidayKeys = useMemo(
    () => new Set((holidays.data ?? []).map((h) => h.date)),
    [holidays.data],
  );
  const workingDays = useMemo(() => {
    let count = 0;
    const total = getDaysInMonth(now);
    for (let d = 1; d <= total; d++) {
      const day = new Date(now.getFullYear(), now.getMonth(), d);
      const wd = day.getDay();
      if (wd === 0 || wd === 6) continue;
      if (holidayKeys.has(format(day, "yyyy-MM-dd"))) continue;
      count++;
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holidayKeys]);

  const rows = [
    { icon: CheckCircle2, tone: "text-success", label: "Days worked", value: `${s?.present_days ?? 0} / ${workingDays}` },
    { icon: Plane, tone: "text-primary", label: "On leave", value: `${s?.leave_days ?? 0}` },
    { icon: TimerReset, tone: "text-warning", label: "Half days", value: `${s?.half_days ?? 0}` },
    { icon: CalendarX2, tone: "text-destructive", label: "Absent", value: `${s?.absent_days ?? 0}` },
  ];

  return (
    <Card className="flex flex-col p-4">
      <CardLabel>This month summary</CardLabel>
      {summary.isLoading ? (
        <Skeleton className="mt-3 h-24 flex-1" />
      ) : (
        <div className="mt-3 flex-1 space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <r.icon className={cn("h-4 w-4", r.tone)} />
                {r.label}
              </span>
              <span className="text-sm font-semibold tabular-nums">{r.value}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 pt-1">
        <SectionLink to="/attendance">View attendance</SectionLink>
      </div>
    </Card>
  );
}

/* ── Card 4: Leave balance ── */
function LeaveBalanceCard() {
  const me = useAuthStore((s) => s.me);
  const q = useQuery({
    queryKey: ["leaves", "balances"],
    queryFn: async () => (await api.get<LeaveBalance[]>("/leaves/balances")).data,
    enabled: !!me?.employee,
  });

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-center justify-between">
        <CardLabel>Leave balance</CardLabel>
        <SectionLink to="/leaves">View all</SectionLink>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{new Date().getFullYear()} entitlement</p>

      <div className="mt-3 flex-1 space-y-2.5">
        {q.isLoading ? (
          <Skeleton className="h-20" />
        ) : (q.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No leave types configured.</p>
        ) : (
          q.data!.slice(0, 3).map((b) => {
            const total = b.allotted || 0;
            const pct = total > 0 ? Math.min(100, Math.round((b.available / total) * 100)) : 0;
            return (
              <div key={b.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">{b.leave_type?.name ?? b.leave_type?.code}</span>
                  <span className="tabular-nums shrink-0">
                    <span className="font-semibold">{b.available}</span>
                    <span className="text-muted-foreground"> / {b.allotted}</span>
                  </span>
                </div>
                <Progress value={pct} color={b.leave_type?.color || undefined} className="h-1.5" />
              </div>
            );
          })
        )}
      </div>
      <div className="mt-2 pt-1">
        <SectionLink to="/leaves">Apply leave</SectionLink>
      </div>
    </Card>
  );
}

/* ── Card 5: Quick actions ── */
const QUICK_ACTIONS = [
  { to: "/leaves", label: "Apply Leave", sub: "Request time off", icon: CalendarCheck2, tone: "bg-primary/10 text-primary" },
  { to: "/regularizations", label: "Regularization", sub: "Correction request", icon: History, tone: "bg-warning/15 text-warning" },
  { to: "/payslips", label: "My Payslips", sub: "View salary slips", icon: ReceiptText, tone: "bg-success/12 text-success" },
  { to: "/attendance", label: "Attendance", sub: "View calendar", icon: CalendarDays, tone: "bg-info/12 text-info" },
];

function QuickActionsCard() {
  return (
    <Card className="flex flex-col p-4">
      <CardTitle className="text-sm">Quick actions</CardTitle>
      <div className="mt-3 grid flex-1 grid-cols-2 gap-2">
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="group flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", a.tone)}>
              <a.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold leading-tight">{a.label}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{a.sub}</span>
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/* ── Card 6: Upcoming holidays ── */
function useHolidays() {
  return useQuery({
    queryKey: ["holidays", "list"],
    queryFn: async () => (await api.get<Holiday[]>("/holidays")).data,
  });
}

function UpcomingHolidaysCard() {
  const q = useHolidays();
  const upcoming = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return (q.data ?? [])
      .filter((h) => parseISO(h.date) >= t)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3);
  }, [q.data]);

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-center justify-between">
        <CardTitle className="text-sm">Upcoming holidays</CardTitle>
        <SectionLink to="/holidays">View calendar</SectionLink>
      </div>
      <div className="mt-3 flex-1">
        {q.isLoading ? (
          <Skeleton className="h-24" />
        ) : upcoming.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <CalendarDays className="h-4 w-4" /> None scheduled
          </div>
        ) : (
          <ul className="space-y-2.5">
            {upcoming.map((h) => {
              const d = parseISO(h.date);
              const days = Math.max(0, differenceInCalendarDays(d, new Date()));
              return (
                <li key={h.id} className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-center leading-none">
                    <div className="text-[9px] font-semibold uppercase text-muted-foreground">
                      {format(d, "MMM")}
                    </div>
                    <div className="text-sm font-bold tabular-nums">{format(d, "d")}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium leading-tight">{h.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {format(d, "EEEE")} · {days === 0 ? "Today" : `In ${days} days`}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

/* ── Card 7: Latest payslip ── */
function LatestPayslipCard() {
  const me = useAuthStore((s) => s.me);
  const q = useQuery({
    queryKey: ["payslips", "latest"],
    queryFn: async () =>
      (await api.get<LatestPayslip | null>("/payroll/payslips/me/latest")).data,
    enabled: !!me?.employee,
  });
  const slip = q.data;

  async function download() {
    if (!slip) return;
    try {
      const r = await api.get(`/payroll/payslips/detail/${slip.payroll_detail_id}/download`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement("a");
      a.href = url;
      const ext = String(r.headers["content-type"] ?? "").includes("pdf") ? "pdf" : "html";
      a.download = `payslip_${slip.period_year}_${slip.period_month}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-center justify-between">
        <CardTitle className="text-sm">Latest payslip</CardTitle>
        <SectionLink to="/payslips">View all</SectionLink>
      </div>
      <div className="mt-3 flex-1">
        {q.isLoading ? (
          <Skeleton className="h-24" />
        ) : !slip ? (
          <div className="flex h-full flex-col items-center justify-center py-4 text-center">
            <ReceiptText className="h-5 w-5 text-muted-foreground" />
            <p className="mt-1.5 text-xs text-muted-foreground">No payslips yet</p>
          </div>
        ) : (
          <div className="rounded-lg border border-success/30 bg-success/5 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{monthLabel(slip.period_year, slip.period_month)}</span>
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                {slip.status}
              </span>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Net pay</div>
                <div className="text-xl font-semibold tabular-nums text-success">
                  {formatCurrency(slip.net_pay)}
                </div>
              </div>
              {slip.paid_on ? (
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid on</div>
                  <div className="text-xs font-medium tabular-nums">
                    {format(parseISO(slip.paid_on), "d MMM yyyy")}
                  </div>
                </div>
              ) : null}
            </div>
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={download}>
              <Download className="h-4 w-4" /> Download payslip
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ── Card 8: Attendance overview ── */
const ATT_LEGEND = [
  { key: "PRESENT", letter: "P", label: "Present", badge: "bg-success", fill: "hsl(var(--success))" },
  { key: "HALF_DAY", letter: "H", label: "Half day", badge: "bg-warning", fill: "hsl(var(--warning))" },
  { key: "ABSENT", letter: "A", label: "Absent", badge: "bg-destructive", fill: "hsl(var(--destructive))" },
  { key: "ON_LEAVE", letter: "O", label: "On leave", badge: "bg-primary", fill: "hsl(var(--primary))" },
  { key: "WEEKEND", letter: "W", label: "Weekly off", badge: "bg-muted-foreground", fill: "hsl(var(--muted-foreground))" },
] as const;

function AttendanceOverviewCard({ className }: { className?: string }) {
  const me = useAuthStore((s) => s.me);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const year = cursor.getFullYear();
  const month = cursor.getMonth() + 1;

  const monthOptions = useMemo(
    () => Array.from({ length: 6 }, (_, i) => startOfMonth(subMonths(new Date(), i))),
    [],
  );

  const q = useQuery({
    queryKey: ["attendance", "month", me?.employee?.id, year, month],
    queryFn: async () =>
      (await api.get<AttendanceDaily[]>("/attendance/month", { params: { year, month } })).data,
    enabled: !!me?.employee,
  });
  const rows = q.data ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const byDate = useMemo(() => {
    const m = new Map<string, AttendanceDaily>();
    rows.forEach((r) => m.set(r.work_date, r));
    return m;
  }, [rows]);

  const days = getDaysInMonth(cursor);
  const chartData = useMemo(
    () =>
      Array.from({ length: days }, (_, i) => {
        const key = format(new Date(year, month - 1, i + 1), "yyyy-MM-dd");
        const row = byDate.get(key);
        const legend = ATT_LEGEND.find((l) => l.key === row?.status);
        return {
          name: String(i + 1),
          value: row ? Math.round(((row.worked_minutes || 0) / 60) * 10) / 10 : 0,
          color: legend?.fill ?? "hsl(var(--border))",
        };
      }),
    [byDate, days, year, month],
  );
  const xInterval = days > 16 ? 2 : 0;

  return (
    <Card className={cn("flex flex-col p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="text-sm">Attendance overview</CardTitle>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Your attendance summary for {format(cursor, "MMMM yyyy")}
          </p>
        </div>
        <Select
          value={format(cursor, "yyyy-MM")}
          onValueChange={(v) => setCursor(startOfMonth(parseISO(`${v}-01`)))}
        >
          <SelectTrigger className="h-8 w-[150px] shrink-0 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {monthOptions.map((m) => (
              <SelectItem key={format(m, "yyyy-MM")} value={format(m, "yyyy-MM")}>
                {format(m, "MMMM yyyy")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 flex items-stretch gap-5">
        {/* Bars */}
        <div className="min-w-0 flex-1">
          {q.isLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : rows.length === 0 ? (
            <div className="grid h-[200px] w-full place-items-center text-xs text-muted-foreground">
              No attendance recorded for this month yet.
            </div>
          ) : (
            <ColoredBars
              data={chartData}
              height={200}
              maxBarSize={20}
              xInterval={xInterval}
              unit="Worked"
              yFormatter={(v) => `${v}h`}
              valueFormatter={(v) => `${v} h`}
            />
          )}
        </div>

        {/* Legend */}
        <div className="flex w-[132px] shrink-0 flex-col justify-center gap-2.5">
          {ATT_LEGEND.map((l) => (
            <div key={l.key} className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold text-white",
                  l.badge,
                )}
              >
                {l.letter}
              </span>
              <span className="flex-1 text-muted-foreground">{l.label}</span>
              <span className="font-semibold tabular-nums">{counts[l.key] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ── Card 9: Announcements ── */
function AnnouncementsCard({ className }: { className?: string }) {
  const q = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => (await api.get<Announcement[]>("/announcements")).data,
  });
  const items = q.data ?? [];

  return (
    <Card className={cn("flex min-h-[240px] flex-col p-4", className)}>
      <div className="flex items-center justify-between">
        <CardTitle className="text-sm">Announcements</CardTitle>
      </div>
      <div className="mt-3 max-h-[220px] flex-1 overflow-y-auto scrollbar-thin pr-1">
        {q.isLoading ? (
          <Skeleton className="h-24" />
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-6 text-center">
            <Megaphone className="h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-xs text-muted-foreground">No announcements</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {items.map((a) => (
              <li key={a.id} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight">{a.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{a.body}</div>
                  {a.created_at ? (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {relativeTime(a.created_at)}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function relativeTime(iso: string): string {
  const days = differenceInCalendarDays(new Date(), parseISO(iso));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return format(parseISO(iso), "d MMM yyyy");
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
