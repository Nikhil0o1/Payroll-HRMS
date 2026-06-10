import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";

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
import type {
  CalcType,
  ComponentCategory,
  EmploymentType,
  SalaryComponentDef,
} from "@/types/api";

const CALC_LABEL: Record<CalcType, string> = {
  FIXED: "Fixed amount",
  PERCENT_OF_BASIC: "% of Basic",
  PERCENT_OF_CTC: "% of CTC",
};

const EMPLOYMENT_TYPES: Array<{ value: EmploymentType; label: string }> = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERN", label: "Intern" },
];

const schema = z.object({
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, "Use uppercase letters, digits, or underscores"),
  name: z.string().min(2).max(120),
  category: z.enum(["EARNING", "DEDUCTION"]),
  calc_type: z.enum(["FIXED", "PERCENT_OF_BASIC", "PERCENT_OF_CTC"]),
  calc_value: z.coerce.number().min(0),
  consider_for_epf: z.boolean(),
  consider_for_esi: z.boolean(),
  is_active: z.boolean(),
});
type Values = z.infer<typeof schema>;

export default function SalaryComponents() {
  const qc = useQueryClient();
  const [employmentType, setEmploymentType] = useState<EmploymentType>("FULL_TIME");
  const [editing, setEditing] = useState<SalaryComponentDef | null>(null);
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ["settings", "salary-components", employmentType],
    queryFn: async () =>
      (
        await api.get<SalaryComponentDef[]>("/settings/salary-components", {
          params: { employment_type: employmentType },
        })
      ).data,
  });

  const remove = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/settings/salary-components/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "salary-components"] });
      toast.success("Component removed");
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const all = q.data ?? [];
  // Earnings first, then deductions — differentiated but in one list.
  const components = useMemo(
    () =>
      [...all].sort((a, b) => {
        if (a.category !== b.category) return a.category === "EARNING" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [all],
  );

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Settings
          </span>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Salary Components</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define the earnings &amp; deductions for each employment type. These build an employee's
            salary structure automatically from their Annual CTC at onboarding.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="shrink-0 self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          Add Component
        </Button>
      </div>

      {/* Employment type selector */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Employment type</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          {EMPLOYMENT_TYPES.map((t, i) => (
            <button
              key={t.value}
              onClick={() => setEmploymentType(t.value)}
              className={cn(
                "px-4 py-1.5 text-sm font-medium transition-colors",
                i !== 0 && "border-l border-border",
                employmentType === t.value
                  ? "bg-primary/10 text-primary"
                  : "bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-[320px] rounded-xl" />
      ) : components.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No components for this type yet"
          description="Add a Basic earning (and any allowances / deductions). The Basic anchors the percentage-based components."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Add Component
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:text-left [&>th]:font-semibold">
                <th>Component</th>
                <th>Type</th>
                <th>Calculation</th>
                <th className="text-center">EPF</th>
                <th className="text-center">ESI</th>
                <th className="text-center">Status</th>
                <th className="w-12 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {components.map((c) => (
                <tr key={c.id} className="group transition-colors hover:bg-muted/30">
                  <td
                    className="cursor-pointer px-4 py-3 font-medium text-primary hover:underline"
                    onClick={() => setEditing(c)}
                  >
                    {c.name}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{c.code}</span>
                  </td>
                  <td className="px-4 py-3">
                    <CategoryBadge category={c.category} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {CALC_LABEL[c.calc_type]}
                    {c.calc_type !== "FIXED"
                      ? ` · ${c.calc_value}%`
                      : c.calc_value > 0
                        ? ` · ₹ ${c.calc_value}`
                        : ""}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ConsiderPill on={c.consider_for_epf} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ConsiderPill on={c.consider_for_esi} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-medium",
                        c.is_active ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          c.is_active ? "bg-success" : "bg-muted-foreground/40",
                        )}
                      />
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => setEditing(c)}
                        className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${c.name}?`)) remove.mutate(c.id);
                        }}
                        className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label="Remove"
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

      <ComponentDialog
        open={creating || !!editing}
        component={editing}
        employmentType={employmentType}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function CategoryBadge({ category }: { category: ComponentCategory }) {
  const earning = category === "EARNING";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        earning ? "bg-success/12 text-success" : "bg-warning/15 text-warning",
      )}
    >
      {earning ? "Earning" : "Deduction"}
    </span>
  );
}

function ConsiderPill({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
        on ? "bg-success/12 text-success" : "bg-muted text-muted-foreground",
      )}
    >
      {on ? "Yes" : "No"}
    </span>
  );
}

function ComponentDialog({
  open,
  component,
  employmentType,
  onClose,
}: {
  open: boolean;
  component: SalaryComponentDef | null;
  employmentType: EmploymentType;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!component;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: component
      ? {
          code: component.code,
          name: component.name,
          category: component.category,
          calc_type: component.calc_type,
          calc_value: component.calc_value,
          consider_for_epf: component.consider_for_epf,
          consider_for_esi: component.consider_for_esi,
          is_active: component.is_active,
        }
      : {
          code: "",
          name: "",
          category: "EARNING",
          calc_type: "FIXED",
          calc_value: 0,
          consider_for_epf: false,
          consider_for_esi: false,
          is_active: true,
        },
  });

  const save = useMutation({
    mutationFn: async (v: Values) => {
      const payload = { ...v, employment_type: component?.employment_type ?? employmentType };
      if (component) {
        return (await api.patch<SalaryComponentDef>(`/settings/salary-components/${component.id}`, payload)).data;
      }
      return (await api.post<SalaryComponentDef>("/settings/salary-components", payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "salary-components"] });
      toast.success(editing ? "Component updated" : "Component added");
      onClose();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const calcType = form.watch("calc_type");
  const typeLabel = EMPLOYMENT_TYPES.find((t) => t.value === (component?.employment_type ?? employmentType))?.label;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit component" : "Add salary component"}
            <span className="ml-2 text-sm font-normal text-muted-foreground">· {typeLabel}</span>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-sm">
                Component name<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input {...form.register("name")} placeholder="e.g. House Rent Allowance" />
              {form.formState.errors.name ? (
                <p className="mt-1 text-xs text-destructive">{form.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">
                Code<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input {...form.register("code")} placeholder="e.g. HRA" className="uppercase" />
              {form.formState.errors.code ? (
                <p className="mt-1 text-xs text-destructive">{form.formState.errors.code.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-sm">Type</Label>
              <Select
                value={form.watch("category")}
                onValueChange={(v) => form.setValue("category", v as ComponentCategory, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EARNING">Earning</SelectItem>
                  <SelectItem value="DEDUCTION">Deduction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">Calculation</Label>
              <Select
                value={form.watch("calc_type")}
                onValueChange={(v) => form.setValue("calc_type", v as CalcType, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Fixed amount</SelectItem>
                  <SelectItem value="PERCENT_OF_BASIC">% of Basic</SelectItem>
                  <SelectItem value="PERCENT_OF_CTC">% of CTC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-sm">
              {calcType === "FIXED" ? "Amount (₹ / month)" : "Percentage (%)"}
            </Label>
            <Input type="number" step={calcType === "FIXED" ? "1" : "0.01"} {...form.register("calc_value")} />
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded border-input text-primary focus:ring-primary/40" {...form.register("consider_for_epf")} />
              Consider for EPF (provident fund)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded border-input text-primary focus:ring-primary/40" {...form.register("consider_for_esi")} />
              Consider for ESI (state insurance)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded border-input text-primary focus:ring-primary/40" {...form.register("is_active")} />
              Active
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? "Save changes" : "Add component"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
