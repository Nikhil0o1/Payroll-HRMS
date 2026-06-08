import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Clock, Pencil, Plus, Star, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Shift } from "@/types/api";

// Mon=0 … Sun=6 (matches the backend weekday convention).
const WEEKDAYS = [
  { i: 0, short: "Mon" },
  { i: 1, short: "Tue" },
  { i: 2, short: "Wed" },
  { i: 3, short: "Thu" },
  { i: 4, short: "Fri" },
  { i: 5, short: "Sat" },
  { i: 6, short: "Sun" },
] as const;

const schema = z
  .object({
    name: z.string().min(2, "Name is required").max(80),
    start_time: z.string().min(1, "Required"),
    end_time: z.string().min(1, "Required"),
    grace_minutes: z.coerce.number().int().min(0).max(240),
    full_day_hours: z.coerce.number().min(0.5, "Required").max(24),
    half_day_hours: z.coerce.number().min(0.5, "Required").max(24),
    weekly_offs: z.array(z.number()),
    is_active: z.boolean(),
    is_default: z.boolean(),
  })
  .refine((d) => d.half_day_hours <= d.full_day_hours, {
    message: "Half day cannot exceed full day",
    path: ["half_day_hours"],
  });
type Values = z.infer<typeof schema>;

const hm = (t: string) => t.slice(0, 5); // "HH:mm:ss" → "HH:mm"
const hours = (mins: number) => Math.round((mins / 60) * 100) / 100;

export default function Shifts() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "shifts"],
    queryFn: async () => (await api.get<Shift[]>("/shifts")).data,
  });

  const [editing, setEditing] = useState<Shift | null>(null);
  const [creating, setCreating] = useState(false);

  const remove = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/shifts/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "shifts"] });
      toast.success("Shift removed");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const shifts = q.data ?? [];

  return (
    <div>
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Settings
          </span>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Shifts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define working shifts. Each employee is assigned one shift, which drives attendance,
            late/early marking and payroll.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="shrink-0 self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          Add Shift
        </Button>
      </div>

      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[210px] rounded-xl" />
          ))}
        </div>
      ) : shifts.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No shifts yet"
          description="Create your first shift (e.g. General Shift, 09:30–18:30). It becomes the default for every employee."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Add Shift
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shifts.map((s) => (
            <ShiftCard
              key={s.id}
              shift={s}
              onEdit={() => setEditing(s)}
              onRemove={() => {
                if (confirm(`Remove ${s.name}?`)) remove.mutate(s.id);
              }}
            />
          ))}
        </div>
      )}

      <ShiftDialog
        open={creating || !!editing}
        shift={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function ShiftCard({
  shift: s,
  onEdit,
  onRemove,
}: {
  shift: Shift;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const offs = WEEKDAYS.filter((d) => s.weekly_offs.includes(d.i)).map((d) => d.short);
  const removable = s.assigned_count === 0 && !s.is_default;
  return (
    <article
      className={cn(
        "group rounded-xl border bg-card p-5 shadow-soft transition hover:border-primary/40",
        !s.is_active && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold leading-snug text-foreground break-words" title={s.name}>
              {s.name}
            </h3>
            {s.is_default ? (
              <Badge variant="success" className="text-[10px]">
                <Star className="h-3 w-3" /> Default
              </Badge>
            ) : null}
            {!s.is_active ? (
              <Badge variant="muted" className="text-[10px]">
                Archived
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {hm(s.start_time)} – {hm(s.end_time)}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={onEdit}
            aria-label="Edit"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onRemove}
            disabled={!removable}
            title={
              s.is_default
                ? "Cannot remove the default shift"
                : s.assigned_count > 0
                  ? "Reassign employees before removing"
                  : "Remove"
            }
            aria-label="Remove"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-center">
        <Stat label="Grace" value={`${s.grace_minutes}m`} />
        <Stat label="Full day" value={`${hours(s.full_day_minutes)}h`} />
        <Stat label="Half day" value={`${hours(s.half_day_minutes)}h`} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">Weekly off:</span>
          {offs.length ? (
            offs.map((d) => (
              <span
                key={d}
                className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {d}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-muted-foreground">None</span>
          )}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {s.assigned_count}
        </span>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-2 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ShiftDialog({
  open,
  shift,
  onClose,
}: {
  open: boolean;
  shift: Shift | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!shift;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: shift
      ? {
          name: shift.name,
          start_time: hm(shift.start_time),
          end_time: hm(shift.end_time),
          grace_minutes: shift.grace_minutes,
          full_day_hours: hours(shift.full_day_minutes),
          half_day_hours: hours(shift.half_day_minutes),
          weekly_offs: shift.weekly_offs,
          is_active: shift.is_active,
          is_default: shift.is_default,
        }
      : {
          name: "",
          start_time: "09:30",
          end_time: "18:30",
          grace_minutes: 10,
          full_day_hours: 8,
          half_day_hours: 4,
          weekly_offs: [5, 6],
          is_active: true,
          is_default: false,
        },
  });

  const offs = form.watch("weekly_offs");
  function toggleOff(i: number) {
    const next = offs.includes(i) ? offs.filter((d) => d !== i) : [...offs, i].sort((a, b) => a - b);
    form.setValue("weekly_offs", next, { shouldDirty: true });
  }

  const save = useMutation({
    mutationFn: async (v: Values) => {
      const payload = {
        name: v.name,
        start_time: v.start_time,
        end_time: v.end_time,
        grace_minutes: v.grace_minutes,
        full_day_minutes: Math.round(v.full_day_hours * 60),
        half_day_minutes: Math.round(v.half_day_hours * 60),
        weekly_offs: v.weekly_offs,
        is_active: v.is_active,
        is_default: v.is_default,
      };
      if (shift) return (await api.patch<Shift>(`/shifts/${shift.id}`, payload)).data;
      return (await api.post<Shift>("/shifts", payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "shifts"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
      toast.success(editing ? "Shift updated" : "Shift created");
      onClose();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit shift" : "Add shift"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
          <div>
            <Label className="mb-1.5 block text-sm">
              Shift name<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input {...form.register("name")} placeholder="e.g. General Shift" />
            {form.formState.errors.name ? (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-sm">Start time</Label>
              <Input type="time" {...form.register("start_time")} />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">End time</Label>
              <Input type="time" {...form.register("end_time")} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="mb-1.5 block text-sm">Grace (min)</Label>
              <Input type="number" min={0} step={1} {...form.register("grace_minutes")} />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">Full day (h)</Label>
              <Input type="number" min={0.5} step={0.5} {...form.register("full_day_hours")} />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">Half day (h)</Label>
              <Input type="number" min={0.5} step={0.5} {...form.register("half_day_hours")} />
              {form.formState.errors.half_day_hours ? (
                <p className="mt-1 text-xs text-destructive">
                  {form.formState.errors.half_day_hours.message}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-sm">Weekly offs</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const on = offs.includes(d.i);
                return (
                  <button
                    key={d.i}
                    type="button"
                    onClick={() => toggleOff(d.i)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                      on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary/40"
                {...form.register("is_default")}
              />
              Set as default shift (auto-assigned to new employees)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary/40"
                {...form.register("is_active")}
              />
              Active (uncheck to archive)
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? "Save changes" : "Add shift"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
