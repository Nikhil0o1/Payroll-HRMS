import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { differenceInCalendarDays, format, isToday, parseISO } from "date-fns";
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock4,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { rolesAtLeast, useAuthStore } from "@/stores/auth";
import type { Holiday, HolidayType } from "@/types/api";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  date: z.string().min(1, "Date is required"),
  type: z.enum(["PUBLIC", "OPTIONAL"]),
  description: z.string().max(500).optional().nullable(),
});
type Values = z.infer<typeof schema>;

type FilterChip = "ALL" | "UPCOMING" | "PUBLIC" | "OPTIONAL";

export function HolidaysPage() {
  const me = useAuthStore((s) => s.me);
  const canEdit = rolesAtLeast(me?.role, "HR_ADMIN");
  const [year, setYear] = useState(new Date().getFullYear());
  const [filter, setFilter] = useState<FilterChip>("ALL");

  const q = useQuery({
    queryKey: ["holidays", year],
    queryFn: async () => (await api.get<Holiday[]>("/holidays", { params: { year } })).data,
  });

  // Sort ascending by date and split past/upcoming based on `today`
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const sorted = useMemo(
    () =>
      (q.data ?? [])
        .slice()
        .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime()),
    [q.data],
  );

  const stats = useMemo(() => {
    let total = 0;
    let past = 0;
    let upcoming = 0;
    let weekdayDaysOff = 0;
    let nextHoliday: Holiday | null = null;
    for (const h of sorted) {
      total += 1;
      const d = parseISO(h.date);
      const dow = d.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dow === 0 || dow === 6;
      if (!isWeekend) weekdayDaysOff += 1;
      if (d < today) {
        past += 1;
      } else {
        upcoming += 1;
        if (!nextHoliday) nextHoliday = h;
      }
    }
    return { total, past, upcoming, weekdayDaysOff, nextHoliday };
  }, [sorted, today]);

  const filtered = useMemo(() => {
    return sorted.filter((h) => {
      if (filter === "PUBLIC") return h.type === "PUBLIC";
      if (filter === "OPTIONAL") return h.type === "OPTIONAL";
      if (filter === "UPCOMING") return parseISO(h.date) >= today;
      return true;
    });
  }, [sorted, filter, today]);

  // Group filtered holidays by month index (0–11) preserving order.
  const grouped = useMemo(() => {
    const map = new Map<number, Holiday[]>();
    for (const h of filtered) {
      const m = parseISO(h.date).getMonth();
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(h);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1, y + 2];
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Holidays</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Company calendar for {year} · {stats.total} holiday{stats.total === 1 ? "" : "s"}
            {stats.upcoming ? ` · ${stats.upcoming} upcoming` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[110px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit ? <HolidayDialog mode="create" /> : null}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat
          label="Total"
          value={stats.total}
          icon={CalendarDays}
          tone="primary"
        />
        <MiniStat
          label="Upcoming"
          value={stats.upcoming}
          icon={Sparkles}
          tone="success"
        />
        <MiniStat
          label="Already past"
          value={stats.past}
          icon={Clock4}
          tone="muted"
        />
        <MiniStat
          label="Next holiday"
          value={
            stats.nextHoliday
              ? format(parseISO(stats.nextHoliday.date), "d MMM")
              : "—"
          }
          icon={CheckCircle2}
          tone="info"
          hint={
            stats.nextHoliday
              ? `${stats.nextHoliday.name} · in ${Math.max(
                  0,
                  differenceInCalendarDays(parseISO(stats.nextHoliday.date), today),
                )}d`
              : "None scheduled"
          }
        />
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(["ALL", "UPCOMING", "PUBLIC", "OPTIONAL"] as FilterChip[]).map((f) => (
          <FilterPill
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
            label={
              f === "ALL"
                ? "All"
                : f === "UPCOMING"
                ? "Upcoming"
                : f === "PUBLIC"
                ? "Public"
                : "Optional"
            }
          />
        ))}
      </div>

      {/* Month-grouped holiday grid */}
      {q.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={
            filter === "ALL"
              ? `No holidays in ${year}`
              : `No ${filter.toLowerCase()} holidays`
          }
          description={
            canEdit
              ? "Click 'Add holiday' to add the first one."
              : "Your administrator hasn't added any yet."
          }
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([monthIdx, holidays]) => (
            <section key={monthIdx} className="space-y-3">
              <MonthDivider month={monthIdx} count={holidays.length} year={year} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {holidays.map((h) => (
                  <HolidayCard
                    key={h.id}
                    holiday={h}
                    today={today}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function FilterPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 px-3 rounded-full text-xs font-medium transition-colors border",
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

type Tone = "primary" | "success" | "muted" | "info";
const toneTile: Record<Tone, string> = {
  primary: "bg-primary/12 text-primary",
  success: "bg-success/12 text-success",
  muted: "bg-muted text-muted-foreground",
  info: "bg-info/12 text-info",
};

function MiniStat({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
}) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div
        className={cn(
          "h-10 w-10 rounded-lg grid place-items-center shrink-0",
          toneTile[tone],
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </p>
        <p className="text-lg font-semibold tabular leading-tight truncate">{value}</p>
        {hint ? (
          <p className="text-[11px] text-muted-foreground truncate">{hint}</p>
        ) : null}
      </div>
    </Card>
  );
}

function MonthDivider({
  month,
  count,
  year,
}: {
  month: number;
  count: number;
  year: number;
}) {
  const label = format(new Date(year, month, 1), "MMMM");
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-xs uppercase tracking-[0.08em] font-semibold text-muted-foreground">
        {label}
      </h2>
      <span className="text-[11px] text-muted-foreground tabular">
        {count} {count === 1 ? "holiday" : "holidays"}
      </span>
      <div className="flex-1 h-px bg-border/70" />
    </div>
  );
}

function HolidayCard({
  holiday,
  today,
  canEdit,
}: {
  holiday: Holiday;
  today: Date;
  canEdit: boolean;
}) {
  const date = parseISO(holiday.date);
  const isPast = date < today;
  const isCurrent = isToday(date);
  const daysAway = differenceInCalendarDays(date, today);

  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/holidays/${holiday.id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      toast.success(`Removed “${holiday.name}”`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  let relative: string;
  if (isCurrent) relative = "Today";
  else if (isPast) relative = `${Math.abs(daysAway)}d ago`;
  else relative = `In ${daysAway}d`;

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all",
        "hover:shadow-card",
        isPast && "opacity-65",
      )}
    >
      <CardContent className="p-4 flex items-stretch gap-3">
        {/* Date tile */}
        <div
          className={cn(
            "shrink-0 h-14 w-14 rounded-lg grid place-items-center text-center",
            isCurrent
              ? "bg-success text-success-foreground"
              : isPast
              ? "bg-muted text-muted-foreground"
              : "bg-primary/10 text-primary",
          )}
        >
          <div>
            <div className="text-[10px] uppercase font-semibold leading-none">
              {format(date, "MMM")}
            </div>
            <div className="text-xl font-bold leading-none mt-1 tabular">
              {format(date, "d")}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate" title={holiday.name}>
                {holiday.name}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {format(date, "EEEE")} · {relative}
              </p>
            </div>
            <Badge variant={holiday.type === "PUBLIC" ? "info" : "muted"}>
              {holiday.type === "PUBLIC" ? "Public" : "Optional"}
            </Badge>
          </div>

          {holiday.description ? (
            <p
              className="mt-2 text-[11px] text-muted-foreground line-clamp-2"
              title={holiday.description}
            >
              {holiday.description}
            </p>
          ) : null}

          {canEdit ? (
            <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <HolidayDialog mode="edit" existing={holiday} />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (
                    confirm(
                      `Remove “${holiday.name}” from the company calendar?\nThis cannot be undone.`,
                    )
                  ) {
                    remove.mutate();
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="text-xs">Remove</span>
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function HolidayDialog({
  mode,
  existing,
}: {
  mode: "create" | "edit";
  existing?: Holiday;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const isEdit = mode === "edit";

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: existing?.name ?? "",
      date: existing?.date ?? "",
      type: (existing?.type as HolidayType | undefined) ?? "PUBLIC",
      description: existing?.description ?? "",
    },
  });

  const save = useMutation({
    mutationFn: async (v: Values) => {
      if (isEdit && existing) {
        return (await api.patch(`/holidays/${existing.id}`, v)).data;
      }
      return (await api.post("/holidays", v)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      toast.success(isEdit ? "Holiday updated" : "Holiday added");
      setOpen(false);
      if (!isEdit) form.reset();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          form.reset({
            name: existing?.name ?? "",
            date: existing?.date ?? "",
            type: (existing?.type as HolidayType | undefined) ?? "PUBLIC",
            description: existing?.description ?? "",
          });
        }
      }}
    >
      <DialogTrigger asChild>
        {isEdit ? (
          <Button size="sm" variant="ghost" className="h-7 px-2">
            <Pencil className="h-3.5 w-3.5" />
            <span className="text-xs">Edit</span>
          </Button>
        ) : (
          <Button>
            <CalendarPlus className="h-4 w-4" /> Add holiday
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${existing!.name}` : "Add holiday"}</DialogTitle>
          <DialogDescription>
            Holidays affect payroll calculations and the leave calendar for everyone.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <div className="space-y-1.5">
            <Label htmlFor="holiday-name">Name</Label>
            <Input
              id="holiday-name"
              placeholder="Independence Day"
              {...form.register("name")}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="holiday-date">Date</Label>
              <Input id="holiday-date" type="date" {...form.register("date")} />
              {form.formState.errors.date ? (
                <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(v) => form.setValue("type", v as Values["type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLIC">Public — observed by all</SelectItem>
                  <SelectItem value="OPTIONAL">Optional — opt-in</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="holiday-desc">Description (optional)</Label>
            <Textarea
              id="holiday-desc"
              rows={2}
              placeholder="A short note shown on the holiday card"
              {...form.register("description")}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {isEdit ? "Save changes" : "Add holiday"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
