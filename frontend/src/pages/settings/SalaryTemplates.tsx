import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronLeft, Pencil, Plus, ReceiptText, Trash2, X } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { api, apiErrorMessage } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import type {
  CalcType,
  ComponentCategory,
  SalaryComponentDef,
  SalaryTemplate,
  SalaryTemplateComponentLine,
} from "@/types/api";

export default function SalaryTemplates() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  if (creating || editingId !== null) {
    return (
      <TemplateBuilder
        templateId={editingId}
        onClose={() => {
          setCreating(false);
          setEditingId(null);
        }}
      />
    );
  }

  return <TemplateList onCreate={() => setCreating(true)} onEdit={setEditingId} />;
}

/* ───────────────────────── List view ───────────────────────── */

function TemplateList({
  onCreate,
  onEdit,
}: {
  onCreate: () => void;
  onEdit: (id: number) => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "salary-templates"],
    queryFn: async () =>
      (await api.get<SalaryTemplate[]>("/settings/salary-templates")).data,
  });

  const remove = useMutation({
    mutationFn: async (id: number) =>
      (await api.delete(`/settings/salary-templates/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "salary-templates"] });
      toast.success("Template removed");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const list = q.data ?? [];

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Settings
          </span>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Salary Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable salary blueprints. Pick one when adding an employee to apply the structure
            instantly.
          </p>
        </div>
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-[260px] rounded-xl" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No salary templates yet"
          description="Create your first template to standardize how you compose CTCs across roles."
          action={
            <Button onClick={onCreate}>
              <Plus className="h-4 w-4" />
              New Template
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-semibold [&>th]:text-left">
                <th>Template name</th>
                <th>Annual CTC</th>
                <th>Components</th>
                <th>Status</th>
                <th className="w-12 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((t) => (
                <tr key={t.id} className="group hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onEdit(t.id)}
                      className="font-medium text-primary hover:underline text-left"
                    >
                      {t.name}
                    </button>
                    {t.description ? (
                      <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {t.annual_ctc ? formatCurrency(t.annual_ctc) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {(t.components ?? []).length} configured
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        t.is_active
                          ? "inline-flex items-center gap-1.5 text-xs font-medium text-success"
                          : "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                      }
                    >
                      <span
                        className={
                          t.is_active
                            ? "h-1.5 w-1.5 rounded-full bg-success"
                            : "h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
                        }
                      />
                      {t.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => onEdit(t.id)}
                        aria-label="Edit"
                        className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${t.name}?`)) remove.mutate(t.id);
                        }}
                        aria-label="Remove"
                        className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Builder view ───────────────────────── */

const builderSchema = z.object({
  name: z.string().min(2, "Name is required").max(120),
  description: z.string().max(500).optional().or(z.literal("")),
  annual_ctc: z.coerce.number().min(0),
  is_active: z.boolean(),
});
type BuilderValues = z.infer<typeof builderSchema>;

function TemplateBuilder({
  templateId,
  onClose,
}: {
  templateId: number | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editing = templateId !== null;

  const t = useQuery({
    queryKey: ["settings", "salary-templates", templateId],
    enabled: editing,
    queryFn: async () =>
      (await api.get<SalaryTemplate>(`/settings/salary-templates/${templateId}`)).data,
  });

  const components = useQuery({
    queryKey: ["settings", "salary-components"],
    queryFn: async () =>
      (await api.get<SalaryComponentDef[]>("/settings/salary-components")).data,
  });

  const form = useForm<BuilderValues>({
    resolver: zodResolver(builderSchema),
    defaultValues: { name: "", description: "", annual_ctc: 0, is_active: true },
  });

  const [lines, setLines] = useState<SalaryTemplateComponentLine[]>([]);

  // Hydrate from template (edit mode)
  useEffect(() => {
    if (t.data) {
      form.reset({
        name: t.data.name,
        description: t.data.description ?? "",
        annual_ctc: t.data.annual_ctc ?? 0,
        is_active: t.data.is_active,
      });
      setLines(t.data.components ?? []);
    }
  }, [t.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const earnings = useMemo(
    () => (components.data ?? []).filter((c) => c.is_active && c.category === "EARNING"),
    [components.data],
  );
  const deductions = useMemo(
    () => (components.data ?? []).filter((c) => c.is_active && c.category === "DEDUCTION"),
    [components.data],
  );
  const reimb = useMemo(
    () => (components.data ?? []).filter((c) => c.is_active && c.category === "REIMBURSEMENT"),
    [components.data],
  );

  const annualCtc = Number(form.watch("annual_ctc") || 0);

  const computeMonthlyAmount = (line: SalaryTemplateComponentLine): number => {
    const monthlyCtc = annualCtc / 12;
    const basic =
      lines.find((l) => l.code === "BASIC" && l.calc_type === "PERCENT_OF_CTC")?.value ?? 50;
    const basicAmount = (monthlyCtc * basic) / 100;
    if (line.calc_type === "FIXED") return Number(line.value || 0);
    if (line.calc_type === "PERCENT_OF_CTC") return (monthlyCtc * Number(line.value || 0)) / 100;
    if (line.calc_type === "PERCENT_OF_BASIC") return (basicAmount * Number(line.value || 0)) / 100;
    return 0;
  };

  const earningTotal = useMemo(
    () => lines.reduce((s, l) => s + computeMonthlyAmount(l), 0),
    [lines, annualCtc],
  );
  const fixedAllowance = Math.max(0, annualCtc / 12 - earningTotal);

  function addComponent(c: SalaryComponentDef) {
    if (lines.find((l) => l.code === c.code)) return;
    setLines((prev) => [
      ...prev,
      { code: c.code, name: c.name, calc_type: c.calc_type, value: c.calc_value },
    ]);
  }

  function removeLine(code: string) {
    setLines((prev) => prev.filter((l) => l.code !== code));
  }

  function updateLine(code: string, patch: Partial<SalaryTemplateComponentLine>) {
    setLines((prev) => prev.map((l) => (l.code === code ? { ...l, ...patch } : l)));
  }

  const save = useMutation({
    mutationFn: async (v: BuilderValues) => {
      const payload = {
        name: v.name,
        description: v.description || undefined,
        annual_ctc: v.annual_ctc,
        is_active: v.is_active,
        components: lines,
      };
      if (editing) {
        return (await api.patch<SalaryTemplate>(`/settings/salary-templates/${templateId}`, payload)).data;
      }
      return (await api.post<SalaryTemplate>("/settings/salary-templates", payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "salary-templates"] });
      toast.success(editing ? "Template updated" : "Template created");
      onClose();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const isLoading = editing && t.isLoading;

  return (
    <div>
      <button
        onClick={onClose}
        className="inline-flex items-center gap-1.5 mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to templates
      </button>
      <h1 className="text-[22px] font-semibold tracking-tight mb-1">
        {editing ? "Edit Salary Template" : "New Salary Template"}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Pick the components that make up the template, then enter how each one is calculated.
      </p>

      {isLoading ? (
        <Skeleton className="h-[600px] rounded-xl" />
      ) : (
        <form
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
          className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6"
        >
          {/* Component picker rail */}
          <aside className="rounded-xl border border-border bg-card p-3">
            <div className="px-2 pb-2 pt-1">
              <h3 className="text-sm font-semibold">Build your Template</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Click a component to add it.</p>
            </div>
            <PickerSection title="Earnings" items={earnings} onPick={addComponent} added={lines} />
            <PickerSection title="Reimbursements" items={reimb} onPick={addComponent} added={lines} />
            <PickerSection title="Deductions" items={deductions} onPick={addComponent} added={lines} />
            {(components.data ?? []).length === 0 ? (
              <p className="px-2 py-6 text-xs text-muted-foreground">
                Add components in <strong>Salary Components</strong> first.
              </p>
            ) : null}
          </aside>

          {/* Builder card */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-[1fr_280px] gap-5">
                <div>
                  <Label className="mb-1.5 block text-sm">
                    Template name<span className="ml-0.5 text-destructive">*</span>
                  </Label>
                  <Input {...form.register("name")} placeholder="e.g. Engineer L3" />
                  {form.formState.errors.name ? (
                    <p className="mt-1 text-xs text-destructive">
                      {form.formState.errors.name.message}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label className="mb-1.5 block text-sm">Annual CTC (₹)</Label>
                  <Input type="number" step="1" {...form.register("annual_ctc")} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label className="mb-1.5 block text-sm">Description</Label>
                <Textarea
                  rows={2}
                  {...form.register("description")}
                  placeholder="Max 500 characters"
                />
              </div>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-semibold [&>th]:text-left">
                    <th>Salary Component</th>
                    <th>Calculation Type</th>
                    <th className="text-right">Monthly Amount</th>
                    <th className="text-right">Annual Amount</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Click a component on the left to add it to the template.
                      </td>
                    </tr>
                  ) : (
                    lines.map((l) => {
                      const monthly = computeMonthlyAmount(l);
                      return (
                        <tr key={l.code}>
                          <td className="px-4 py-3 font-medium">{l.name}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Select
                                value={l.calc_type}
                                onValueChange={(v) =>
                                  updateLine(l.code, { calc_type: v as CalcType })
                                }
                              >
                                <SelectTrigger className="h-8 w-[170px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="FIXED">Fixed amount</SelectItem>
                                  <SelectItem value="PERCENT_OF_BASIC">% of Basic</SelectItem>
                                  <SelectItem value="PERCENT_OF_CTC">% of CTC</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                step="0.01"
                                value={l.value}
                                onChange={(e) =>
                                  updateLine(l.code, { value: Number(e.target.value) })
                                }
                                className="h-8 w-24 text-right"
                              />
                              {l.calc_type !== "FIXED" ? (
                                <span className="text-xs text-muted-foreground">%</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(monthly)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(monthly * 12)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeLine(l.code)}
                              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                              aria-label="Remove"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}

                  {fixedAllowance > 0 ? (
                    <tr className="bg-muted/30 text-muted-foreground">
                      <td className="px-4 py-3">
                        <div className="font-medium">Fixed Allowance</div>
                        <div className="text-xs">Monthly CTC − sum of all components</div>
                      </td>
                      <td className="px-4 py-3 text-xs">Auto · balancing figure</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(fixedAllowance)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(fixedAllowance * 12)}</td>
                      <td />
                    </tr>
                  ) : null}
                </tbody>
                <tfoot>
                  <tr className="bg-primary/5 text-primary">
                    <td className="px-4 py-3 font-semibold" colSpan={2}>
                      Cost to Company
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatCurrency(annualCtc / 12)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatCurrency(annualCtc)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary/40"
                  {...form.register("is_active")}
                />
                Active
              </label>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" loading={save.isPending}>
                  {editing ? "Save changes" : "Create template"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

function PickerSection({
  title,
  items,
  onPick,
  added,
}: {
  title: string;
  items: SalaryComponentDef[];
  onPick: (c: SalaryComponentDef) => void;
  added: SalaryTemplateComponentLine[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ul className="mt-1 space-y-0.5">
        {items.map((c) => {
          const inUse = added.some((l) => l.code === c.code);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                disabled={inUse}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-default"
              >
                <span className="truncate">{c.name}</span>
                {inUse ? (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Added
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
