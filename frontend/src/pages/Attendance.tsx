import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  endOfMonth,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  isAfter,
  addDays,
  isToday,
} from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  Plane,
  Timer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart } from "@/components/ui/charts";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { AttendanceBadge } from "@/components/status-badge";
import { api } from "@/lib/api";
import { cn, formatISTTime, minutesToHours } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import type { AttendanceDaily, AttendanceSummary } from "@/types/api";

export function AttendancePage() {
  const me = useAuthStore((s) => s.me);
  const employeeId = me?.employee?.id;
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const year = cursor.getFullYear();
  const month = cursor.getMonth() + 1;
  const atCurrentMonth = isAfter(addMonths(cursor, 1), startOfMonth(new Date()));

  const monthQuery = useQuery({
    queryKey: ["attendance", "month", employeeId, year, month],
    queryFn: async () =>
      (
        await api.get<AttendanceDaily[]>("/attendance/month", {
          params: { year, month },
        })
      ).data,
    enabled: !!employeeId,
  });

  const summaryQuery = useQuery({
    queryKey: ["attendance", "summary", employeeId, year, month],
    queryFn: async () => {
      const start = format(startOfMonth(cursor), "yyyy-MM-dd");
      const end = format(endOfMonth(cursor), "yyyy-MM-dd");
      return (
        await api.get<AttendanceSummary>("/attendance/summary", {
          params: { period_start: start, period_end: end },
        })
      ).data;
    },
    enabled: !!employeeId,
  });

  const byDate = useMemo(() => {
    const m = new Map<string, AttendanceDaily>();
    (monthQuery.data ?? []).forEach((d) => m.set(d.work_date, d));
    return m;
  }, [monthQuery.data]);

  const calendarDays = useMemo(() => buildCalendar(cursor), [cursor]);

  const summary = summaryQuery.data;
  const donutData = useMemo(
    () => [
      { name: "Present", value: summary?.present_days ?? 0, color: "hsl(var(--success))" },
      { name: "Half day", value: summary?.half_days ?? 0, color: "hsl(var(--warning))" },
      { name: "On leave", value: summary?.leave_days ?? 0, color: "hsl(var(--primary))" },
      { name: "Absent", value: summary?.absent_days ?? 0, color: "hsl(var(--destructive))" },
    ],
    [summary],
  );
  const trackedDays =
    (summary?.present_days ?? 0) +
    (summary?.half_days ?? 0) +
    (summary?.leave_days ?? 0) +
    (summary?.absent_days ?? 0);

  if (!employeeId) {
    return (
      <>
        <PageHeader
          title="Attendance"
          description="Track your daily punches, working hours and monthly summary."
          icon={CalendarClock}
        />
        <EmptyState
          icon={CalendarOff}
          title="No employee linked"
          description="This account doesn't have an employee record yet. Once linked, your daily punches and monthly summary will appear here."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Track your daily punches, working hours and monthly summary."
        icon={CalendarClock}
        actions={
          <div className="flex items-center gap-1 rounded-lg border bg-card p-1 shadow-soft">
            <SimpleTooltip label="Previous month">
              <Button variant="ghost" size="icon-sm" onClick={() => setCursor(addMonths(cursor, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </SimpleTooltip>
            <span className="min-w-[124px] px-2 text-center text-sm font-medium tabular-nums">
              {format(cursor, "MMMM yyyy")}
            </span>
            <SimpleTooltip label="Next month">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setCursor(addMonths(cursor, 1))}
                disabled={atCurrentMonth}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </SimpleTooltip>
            <Button
              variant="outline"
              size="sm"
              className="ml-1"
              onClick={() => setCursor(startOfMonth(new Date()))}
            >
              Today
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 mb-6 sm:grid-cols-2 xl:grid-cols-5">
        {summaryQuery.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Present days"
              value={summary?.present_days ?? 0}
              tone="success"
              icon={CalendarClock}
              hint={`${minutesToHours(summary?.total_worked_minutes ?? 0)} worked`}
            />
            <StatCard label="Half days" value={summary?.half_days ?? 0} tone="warning" icon={Timer} />
            <StatCard label="On leave" value={summary?.leave_days ?? 0} tone="primary" icon={Plane} />
            <StatCard
              label="Absent"
              value={summary?.absent_days ?? 0}
              tone="destructive"
              icon={CalendarOff}
            />
            <StatCard
              label="Late marks"
              value={summary?.late_count ?? 0}
              tone="info"
              icon={Clock}
              hint={
                (summary?.missing_punch_count ?? 0) > 0
                  ? `${summary?.missing_punch_count} missing punch`
                  : undefined
              }
            />
          </>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>{format(cursor, "MMMM yyyy")}</CardTitle>
            <CardDescription>Daily attendance calendar</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1.5 mb-2">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div
                  key={d}
                  className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-center py-1"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((d) => {
                const key = format(d, "yyyy-MM-dd");
                const inMonth = isSameMonth(d, cursor);
                const data = byDate.get(key);
                const today = isToday(d);
                const tile = (
                  <div
                    className={cn(
                      "aspect-[5/4] min-h-[72px] rounded-lg border bg-card p-1.5 flex flex-col text-xs transition-colors",
                      data && "hover:border-primary/40 hover:bg-muted/40",
                      !inMonth && "opacity-40",
                      today && "ring-2 ring-primary/40",
                      data?.is_locked && "border-primary/20",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "font-medium tabular-nums",
                          today && "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground",
                        )}
                      >
                        {format(d, "d")}
                      </span>
                      {data ? <DayDot status={data.status} /> : null}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-1">
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {data?.worked_minutes ? minutesToHours(data.worked_minutes) : ""}
                      </span>
                      <span className="flex items-center gap-0.5">
                        {data?.is_late ? <Clock className="h-3 w-3 text-warning" /> : null}
                        {data?.has_missing_punch ? (
                          <AlertTriangle className="h-3 w-3 text-destructive" />
                        ) : null}
                        {data?.is_locked ? <Lock className="h-3 w-3 text-muted-foreground" /> : null}
                      </span>
                    </div>
                  </div>
                );
                if (!data) {
                  return <div key={key}>{tile}</div>;
                }
                return (
                  <SimpleTooltip
                    key={key}
                    label={
                      <span className="space-y-0.5">
                        <span className="block font-semibold">{format(d, "EEE, d MMM")}</span>
                        <span className="block">
                          {statusLabel(data.status)}
                          {data.worked_minutes ? ` · ${minutesToHours(data.worked_minutes)}` : ""}
                        </span>
                        {data.is_late ? <span className="block">Late arrival</span> : null}
                        {data.is_early_leave ? <span className="block">Early checkout</span> : null}
                        {data.has_missing_punch ? <span className="block">Missing punch</span> : null}
                      </span>
                    }
                  >
                    <div>{tile}</div>
                  </SimpleTooltip>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Month breakdown</CardTitle>
            <CardDescription>Status distribution</CardDescription>
          </CardHeader>
          <CardContent>
            {summaryQuery.isLoading ? (
              <Skeleton className="h-[200px] rounded-xl" />
            ) : (
              <>
                <DonutChart
                  data={donutData}
                  center={
                    <div className="text-center">
                      <p className="text-2xl font-semibold tabular-nums">{trackedDays}</p>
                      <p className="text-xs text-muted-foreground">tracked days</p>
                    </div>
                  }
                />
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {donutData.map((d) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-[3px]"
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="ml-auto font-medium tabular-nums">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Daily breakdown</CardTitle>
          <CardDescription>Detail rows for {format(cursor, "MMMM yyyy")}.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>First in</TableHead>
                <TableHead>Last out</TableHead>
                <TableHead className="text-right">Worked</TableHead>
                <TableHead>Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-6" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (monthQuery.data ?? []).length === 0 ? (
                <TableEmpty colSpan={6} message="No attendance data for this month yet." />
              ) : (
                (monthQuery.data ?? []).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium tabular-nums">
                      {format(parseISO(d.work_date), "EEE, d MMM")}
                    </TableCell>
                    <TableCell>
                      <AttendanceBadge status={d.status} />
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatISTTime(d.first_in)}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatISTTime(d.last_out)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {minutesToHours(d.worked_minutes)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {d.is_late ? (
                          <Badge variant="warning">
                            <Clock className="h-3 w-3" /> Late
                          </Badge>
                        ) : null}
                        {d.is_early_leave ? (
                          <Badge variant="warning">
                            <Timer className="h-3 w-3" /> Early out
                          </Badge>
                        ) : null}
                        {d.has_missing_punch ? (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3" /> Missing punch
                          </Badge>
                        ) : null}
                        {d.is_locked ? (
                          <Badge variant="muted">
                            <Lock className="h-3 w-3" /> Locked
                          </Badge>
                        ) : null}
                        {!d.is_late && !d.is_early_leave && !d.has_missing_punch && !d.is_locked ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function statusLabel(status: AttendanceDaily["status"]): string {
  const map: Record<AttendanceDaily["status"], string> = {
    PRESENT: "Present",
    HALF_DAY: "Half day",
    ABSENT: "Absent",
    ON_LEAVE: "On leave",
    HOLIDAY: "Holiday",
    WEEKEND: "Weekend",
  };
  return map[status];
}

function DayDot({ status }: { status: AttendanceDaily["status"] }) {
  const map = {
    PRESENT: "bg-success",
    HALF_DAY: "bg-warning",
    ABSENT: "bg-destructive",
    ON_LEAVE: "bg-primary",
    HOLIDAY: "bg-muted-foreground",
    WEEKEND: "bg-muted",
  } as const;
  return <span className={cn("h-1.5 w-1.5 rounded-full", map[status])} />;
}

function buildCalendar(cursor: Date): Date[] {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const days: Date[] = [];
  let d = start;
  while (d <= end) {
    days.push(d);
    d = addDays(d, 1);
  }
  return days;
}
