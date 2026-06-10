import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { differenceInCalendarDays, format, isToday, parseISO } from "date-fns";
import {
  CalendarDays,
  CalendarPlus,
  List,
  Pencil,
  Table2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
type ViewMode = "table" | "list";

export function HolidaysPage() {
  const me = useAuthStore((s) => s.me);
  const canEdit = rolesAtLeast(me?.role, "HR_ADMIN");
  const [year, setYear] = useState(new Date().getFullYear());
  const [filter, setFilter] = useState<FilterChip>("ALL");
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem("holidays-view") as ViewMode) || "list",
  );
  useEffect(() => localStorage.setItem("holidays-view", view), [view]);

  const q = useQuery({
    queryKey: ["holidays", year],
    queryFn: async () => (await api.get<Holiday[]>("/holidays", { params: { year } })).data,
  });

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
    let upcoming = 0;
    let nextHoliday: Holiday | null = null;
    for (const h of sorted) {
      total += 1;
      if (parseISO(h.date) >= today) {
        upcoming += 1;
        if (!nextHoliday) nextHoliday = h;
      }
    }
    return { total, upcoming, nextHoliday };
  }, [sorted, today]);

  const filtered = useMemo(
    () =>
      sorted.filter((h) => {
        if (filter === "PUBLIC") return h.type === "PUBLIC";
        if (filter === "OPTIONAL") return h.type === "OPTIONAL";
        if (filter === "UPCOMING") return parseISO(h.date) >= today;
        return true;
      }),
    [sorted, filter, today],
  );

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

  const nextLabel = stats.nextHoliday
    ? `${stats.nextHoliday.name} · in ${Math.max(
        0,
        differenceInCalendarDays(parseISO(stats.nextHoliday.date), today),
      )}d`
    : "none scheduled";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Holidays</h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {stats.total} in {year} · {stats.upcoming} upcoming · next: {nextLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-9 w-[96px]">
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
          <ViewToggle view={view} onChange={setView} />
          {canEdit ? <HolidayDialog mode="create" /> : null}
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(["ALL", "UPCOMING", "PUBLIC", "OPTIONAL"] as FilterChip[]).map((f) => (
          <FilterPill
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
            label={
              f === "ALL" ? "All" : f === "UPCOMING" ? "Upcoming" : f === "PUBLIC" ? "Public" : "Optional"
            }
          />
        ))}
      </div>

      {/* Body */}
      {q.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={filter === "ALL" ? `No holidays in ${year}` : `No ${filter.toLowerCase()} holidays`}
          description={
            canEdit ? "Click 'Add holiday' to add the first one." : "Your administrator hasn't added any yet."
          }
        />
      ) : view === "table" ? (
        <HolidayTable rows={filtered} today={today} canEdit={canEdit} />
      ) : (
        <HolidayListView grouped={grouped} today={today} canEdit={canEdit} year={year} />
      )}
    </div>
  );
}

// ─── shared bits ─────────────────────────────────────────────────────────────

function relativeLabel(date: Date, today: Date): string {
  if (isToday(date)) return "Today";
  const d = differenceInCalendarDays(date, today);
  return d < 0 ? `${Math.abs(d)}d ago` : `in ${d}d`;
}

function TypeBadge({ type }: { type: HolidayType }) {
  return (
    <Badge variant={type === "PUBLIC" ? "info" : "muted"}>
      {type === "PUBLIC" ? "Public" : "Optional"}
    </Badge>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="inline-flex h-9 items-center rounded-md border border-border bg-card p-0.5">
      {([
        { v: "list", icon: List, label: "List view" },
        { v: "table", icon: Table2, label: "Table view" },
      ] as const).map(({ v, icon: Icon, label }) => (
        <button
          key={v}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => onChange(v)}
          className={cn(
            "grid h-8 w-8 place-items-center rounded transition-colors",
            view === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

function FilterPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function RowActions({ holiday, canEdit }: { holiday: Holiday; canEdit: boolean }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/holidays/${holiday.id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      toast.success(`Removed “${holiday.name}”`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  if (!canEdit) return null;
  return (
    <div className="flex items-center justify-end gap-0.5">
      <HolidayDialog mode="edit" existing={holiday} />
      <button
        type="button"
        aria-label="Remove holiday"
        title="Remove"
        onClick={() => {
          if (confirm(`Remove “${holiday.name}” from the company calendar?\nThis cannot be undone.`)) {
            remove.mutate();
          }
        }}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Table view ──────────────────────────────────────────────────────────────

function HolidayTable({ rows, today, canEdit }: { rows: Holiday[]; today: Date; canEdit: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[150px]">Date</TableHead>
            <TableHead>Holiday</TableHead>
            <TableHead className="w-[110px]">Type</TableHead>
            <TableHead className="hidden md:table-cell">Note</TableHead>
            <TableHead className="w-[110px] text-right">When</TableHead>
            {canEdit ? <TableHead className="w-[84px] text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((h) => {
            const d = parseISO(h.date);
            const past = d < today && !isToday(d);
            return (
              <TableRow key={h.id} className={cn(past && "opacity-55")}>
                <TableCell className="font-medium tabular-nums">
                  <div className="flex items-baseline gap-2">
                    <span>{format(d, "dd MMM")}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">{format(d, "EEE")}</span>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{h.name}</TableCell>
                <TableCell>
                  <TypeBadge type={h.type} />
                </TableCell>
                <TableCell className="hidden max-w-[280px] truncate text-sm text-muted-foreground md:table-cell">
                  {h.description || "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right text-xs tabular-nums",
                    isToday(d) ? "font-semibold text-success" : "text-muted-foreground",
                  )}
                >
                  {relativeLabel(d, today)}
                </TableCell>
                {canEdit ? (
                  <TableCell className="text-right">
                    <RowActions holiday={h} canEdit={canEdit} />
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── List view ───────────────────────────────────────────────────────────────

function HolidayListView({
  grouped,
  today,
  canEdit,
  year,
}: {
  grouped: [number, Holiday[]][];
  today: Date;
  canEdit: boolean;
  year: number;
}) {
  return (
    <div className="space-y-5">
      {grouped.map(([monthIdx, holidays]) => (
        <section key={monthIdx}>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {format(new Date(year, monthIdx, 1), "MMMM")}
            </h2>
            <span className="text-[11px] text-muted-foreground">· {holidays.length}</span>
            <div className="h-px flex-1 bg-border/70" />
          </div>
          <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
            {holidays.map((h) => (
              <HolidayListRow key={h.id} holiday={h} today={today} canEdit={canEdit} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function HolidayListRow({ holiday, today, canEdit }: { holiday: Holiday; today: Date; canEdit: boolean }) {
  const d = parseISO(holiday.date);
  const past = d < today && !isToday(d);
  const current = isToday(d);
  return (
    <div className={cn("group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40", past && "opacity-55")}>
      {/* Date chip */}
      <div
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-lg text-center leading-none",
          current ? "bg-success text-success-foreground" : past ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        )}
      >
        <div>
          <div className="text-[9px] font-semibold uppercase">{format(d, "MMM")}</div>
          <div className="mt-0.5 text-base font-bold tabular-nums">{format(d, "d")}</div>
        </div>
      </div>

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" title={holiday.name}>
          {holiday.name}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {format(d, "EEEE")} · {relativeLabel(d, today)}
          {holiday.description ? ` · ${holiday.description}` : ""}
        </p>
      </div>

      <TypeBadge type={holiday.type} />
      {canEdit ? (
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <RowActions holiday={holiday} canEdit={canEdit} />
        </div>
      ) : null}
    </div>
  );
}

// ─── Create / edit dialog (admin) ────────────────────────────────────────────

function HolidayDialog({ mode, existing }: { mode: "create" | "edit"; existing?: Holiday }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const isEdit = mode === "edit";

  const defaults = (): Values => ({
    name: existing?.name ?? "",
    date: existing?.date ?? "",
    type: (existing?.type as HolidayType | undefined) ?? "PUBLIC",
    description: existing?.description ?? "",
  });

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults() });

  const save = useMutation({
    mutationFn: async (v: Values) =>
      isEdit && existing
        ? (await api.patch(`/holidays/${existing.id}`, v)).data
        : (await api.post("/holidays", v)).data,
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
        if (v) form.reset(defaults());
      }}
    >
      <DialogTrigger asChild>
        {isEdit ? (
          <button
            type="button"
            aria-label="Edit holiday"
            title="Edit"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
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
            <Input id="holiday-name" placeholder="Independence Day" {...form.register("name")} />
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
              <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as Values["type"])}>
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
