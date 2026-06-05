import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PaySchedule } from "@/types/api";

// Mon-first labels with day numbers (Sun=0...Sat=6)
const DAYS: Array<{ idx: number; label: string }> = [
  { idx: 0, label: "SUN" },
  { idx: 1, label: "MON" },
  { idx: 2, label: "TUE" },
  { idx: 3, label: "WED" },
  { idx: 4, label: "THU" },
  { idx: 5, label: "FRI" },
  { idx: 6, label: "SAT" },
];

const schema = z.object({
  work_week: z.array(z.number().min(0).max(6)).min(1, "Pick at least one day"),
  salary_calc_basis: z.enum(["actual", "org_days"]),
  org_working_days: z.coerce.number().min(20).max(31).optional().nullable(),
  pay_day_type: z.enum(["last_working_day", "fixed_day"]),
  pay_day: z.coerce.number().min(1).max(31).optional().nullable(),
  first_payroll_month: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM"),
});
type Values = z.infer<typeof schema>;

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function PaySchedulePage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "pay-schedule"],
    queryFn: async () => (await api.get<PaySchedule>("/settings/pay-schedule")).data,
  });

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      work_week: [1, 2, 3, 4, 5],
      salary_calc_basis: "actual",
      org_working_days: 30,
      pay_day_type: "last_working_day",
      pay_day: 30,
      first_payroll_month: thisMonth(),
    },
  });

  useEffect(() => {
    if (q.data) {
      form.reset({
        work_week: q.data.work_week ?? [1, 2, 3, 4, 5],
        salary_calc_basis: q.data.salary_calc_basis,
        org_working_days: q.data.org_working_days ?? 30,
        pay_day_type: q.data.pay_day_type,
        pay_day: q.data.pay_day ?? 30,
        first_payroll_month: q.data.first_payroll_month ?? thisMonth(),
      });
    }
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async (v: Values) => {
      const payload: Partial<Values> = { ...v };
      if (v.salary_calc_basis === "actual") payload.org_working_days = null as any;
      if (v.pay_day_type === "last_working_day") payload.pay_day = null as any;
      return (await api.put<PaySchedule>("/settings/pay-schedule", payload)).data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["settings", "pay-schedule"], data);
      toast.success("Pay schedule saved");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const ww = form.watch("work_week") ?? [];
  const basis = form.watch("salary_calc_basis");
  const payDayType = form.watch("pay_day_type");
  const firstMonth = form.watch("first_payroll_month") ?? thisMonth();

  const calendar = useMemo(() => buildCalendar(firstMonth), [firstMonth]);

  function toggleDay(idx: number) {
    const set = new Set(ww);
    if (set.has(idx)) set.delete(idx);
    else set.add(idx);
    form.setValue("work_week", Array.from(set).sort((a, b) => a - b), { shouldDirty: true });
  }

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-[600px] rounded-xl" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Settings
        </span>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Pay Schedule</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define when employees are paid and which days count as your work week.
        </p>
      </div>

      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-8">
        <Section
          title="Select your work week"
          required
          help="The days worked in a calendar week."
        >
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {DAYS.map((d, i) => {
              const active = ww.includes(d.idx);
              return (
                <button
                  type="button"
                  key={d.idx}
                  onClick={() => toggleDay(d.idx)}
                  className={cn(
                    "h-10 px-5 text-xs font-semibold tracking-wider transition-colors",
                    i !== 0 && "border-l border-border",
                    active
                      ? "bg-primary/10 text-primary"
                      : "bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          {form.formState.errors.work_week ? (
            <p className="mt-2 text-xs text-destructive">{form.formState.errors.work_week.message}</p>
          ) : null}
        </Section>

        <Section title="Calculate monthly salary based on" required>
          <div className="space-y-3">
            <RadioRow
              checked={basis === "actual"}
              onChange={() => form.setValue("salary_calc_basis", "actual", { shouldDirty: true })}
              label="Actual days in a month"
            />
            <RadioRow
              checked={basis === "org_days"}
              onChange={() => form.setValue("salary_calc_basis", "org_days", { shouldDirty: true })}
              label={
                <span className="flex items-center gap-3">
                  Organisation working days —
                  <Select
                    value={String(form.watch("org_working_days") ?? 30)}
                    onValueChange={(v) =>
                      form.setValue("org_working_days", Number(v), { shouldDirty: true })
                    }
                  >
                    <SelectTrigger className="h-8 w-[100px]" disabled={basis !== "org_days"}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }).map((_, i) => {
                        const v = 20 + i;
                        return (
                          <SelectItem key={v} value={String(v)}>
                            {v}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  days per month
                </span>
              }
            />
          </div>
        </Section>

        <Section title="Pay your employees on" required>
          <div className="space-y-3">
            <RadioRow
              checked={payDayType === "last_working_day"}
              onChange={() =>
                form.setValue("pay_day_type", "last_working_day", { shouldDirty: true })
              }
              label="the last working day of every month"
            />
            <RadioRow
              checked={payDayType === "fixed_day"}
              onChange={() =>
                form.setValue("pay_day_type", "fixed_day", { shouldDirty: true })
              }
              label={
                <span className="flex items-center gap-3">
                  day
                  <Select
                    value={String(form.watch("pay_day") ?? 30)}
                    onValueChange={(v) => form.setValue("pay_day", Number(v), { shouldDirty: true })}
                  >
                    <SelectTrigger className="h-8 w-[80px]" disabled={payDayType !== "fixed_day"}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }).map((_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  of every month
                </span>
              }
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Note: When payday falls on a non-working day or a holiday, employees will get paid on
            the previous working day.
          </p>
        </Section>

        <Section title="Start your first payroll from" required>
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 items-start">
            <Input
              type="month"
              {...form.register("first_payroll_month")}
              className="h-10 w-full"
            />
            <Calendar month={firstMonth} workWeek={ww} />
          </div>
        </Section>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
            Save schedule
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => q.data && form.reset()}
            disabled={!form.formState.isDirty}
          >
            Discard
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  required,
  help,
  children,
}: {
  title: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <Label className="block mb-1 text-sm font-semibold">
        {title}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {help ? <p className="mb-3 text-xs text-muted-foreground">{help}</p> : null}
      {children}
    </section>
  );
}

function RadioRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-3 text-sm cursor-pointer">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 border-input text-primary focus:ring-primary/40"
      />
      <span className="text-foreground">{label}</span>
    </label>
  );
}

function buildCalendar(month: string): { label: string; weeks: Array<Array<{ d: number | null; idx: number | null }>> } {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return { label: "", weeks: [] };
  const date = new Date(y, m - 1, 1);
  const label = date.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const startDow = date.getDay(); // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: Array<{ d: number | null; idx: number | null }> = [];
  for (let i = 0; i < startDow; i++) cells.push({ d: null, idx: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const idx = new Date(y, m - 1, d).getDay();
    cells.push({ d, idx });
  }
  while (cells.length % 7 !== 0) cells.push({ d: null, idx: null });
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { label, weeks };
}

function Calendar({ month, workWeek }: { month: string; workWeek: number[] }) {
  const { label, weeks } = useMemo(() => buildCalendar(month), [month]);
  const today = new Date();
  return (
    <div className="rounded-xl border border-border bg-card p-4 max-w-[340px]">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <table className="w-full text-center text-xs text-muted-foreground">
        <thead>
          <tr>
            {DAYS.map((d) => (
              <th key={d.idx} className="py-1.5 font-medium">
                {d.label.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((cell, ci) => {
                if (cell.d === null)
                  return <td key={ci} className="h-8 text-muted-foreground/30">·</td>;
                const off = !workWeek.includes(cell.idx ?? -1);
                const isToday =
                  cell.d === today.getDate() &&
                  month === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
                return (
                  <td
                    key={ci}
                    className={cn(
                      "h-8 align-middle text-sm",
                      off ? "text-muted-foreground/40" : "text-foreground",
                      isToday && "rounded-md ring-1 ring-primary text-primary font-semibold",
                    )}
                  >
                    {cell.d}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
